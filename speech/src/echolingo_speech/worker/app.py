"""The private Speech Evaluation Worker HTTP service (ADR-0013, roadmap SS10.4).

Startup loads one explicitly configured bundle (`worker_bundle_id` in
speech.yaml, or `--bundle-id`), the pinned encoder and the aligner, and runs
every stage once on a warm-up tone; any failure stops the process instead of
serving a half-loaded model. It never picks a bundle by itself.

- `GET /health`: the loaded bundle, encoder, aligner and limits;
- `POST /v1/evaluate`: multipart `audio` (WAV/FLAC) + `reference_text` ->
  `schema.EvaluationResult`, or `schema.ErrorResponse` with a status code.

One evaluation runs at a time. A request that cannot start, or finish,
within `request_timeout_sec` gets `worker_busy` (503) or `timeout` (504); a
timed-out evaluation still runs to completion in the background (the aligner
has its own subprocess timeout) before the next one starts. The Worker binds
to localhost: FastAPI is its only client and the browser never reaches it.

CLI: `python -m echolingo_speech.worker.app serve --config configs/speech.yaml`
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import math
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

from echolingo_speech.worker.pipeline import EvaluationError, SpeechEvaluationPipeline
from echolingo_speech.worker.schema import (
    ErrorDetail,
    ErrorResponse,
    EvaluationResult,
    HealthResponse,
)

logger = logging.getLogger("echolingo_speech.worker")

DEFAULT_REQUEST_TIMEOUT_SEC = 25.0
_BUNDLE_ID_RE = re.compile(r"^speech-evaluator-v\d+\.\d+\.\d+$")


def _error(code: str, message: str, status_code: int) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code, message=message))
    return JSONResponse(status_code=status_code, content=body.model_dump())


def create_app(
    load_pipeline: Callable[[], tuple[SpeechEvaluationPipeline, dict]],
    *,
    request_timeout_sec: float = DEFAULT_REQUEST_TIMEOUT_SEC,
) -> FastAPI:
    """`load_pipeline` returns the pipeline and the static part of `/health`
    (aligner version, device). It runs once, at startup."""
    state: dict = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="speech-eval")
        try:
            loop = asyncio.get_running_loop()
            pipeline, health = await loop.run_in_executor(executor, load_pipeline)
            state.update(
                pipeline=pipeline, health=health, executor=executor, lock=asyncio.Lock()
            )
            logger.info("loaded bundle %s", pipeline.bundle.bundle_id)
            yield
        finally:
            executor.shutdown(wait=True)

    app = FastAPI(title="EchoLingo Speech Evaluation Worker", lifespan=lifespan)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        pipeline: SpeechEvaluationPipeline = state["pipeline"]
        return HealthResponse(
            status="ready",
            bundle_id=pipeline.bundle.bundle_id,
            encoder_model_id=pipeline.encoder.model_id,
            encoder_revision=pipeline.encoder.revision,
            aligner=pipeline.aligner.name,
            limits={**pipeline.limits.as_dict(), "request_timeout_sec": request_timeout_sec},
            **state["health"],
        )

    @app.post(
        "/v1/evaluate",
        response_model=EvaluationResult,
        responses={code: {"model": ErrorResponse} for code in (400, 413, 422, 500, 503, 504)},
    )
    async def evaluate(
        audio: UploadFile = File(...),
        reference_text: str = Form(...),
        task_type: str = Form("read_aloud"),
    ):
        if task_type != "read_aloud":
            return _error("invalid_request", f"unsupported task_type {task_type!r}", 400)
        pipeline: SpeechEvaluationPipeline = state["pipeline"]
        # One byte over the limit is enough for decode_audio to refuse it.
        data = await audio.read(pipeline.limits.max_upload_bytes + 1)

        loop = asyncio.get_running_loop()
        deadline = loop.time() + request_timeout_sec
        lock: asyncio.Lock = state["lock"]
        try:
            await asyncio.wait_for(lock.acquire(), timeout=request_timeout_sec)
        except TimeoutError:
            return _error("worker_busy", "another evaluation is still running", 503)
        try:
            future = loop.run_in_executor(
                state["executor"], pipeline.evaluate, data, reference_text
            )
        except BaseException:
            lock.release()
            raise
        # The lock is held until the evaluation itself ends, even when this
        # request has already given up on it.
        future.add_done_callback(lambda _: lock.release())
        try:
            return await asyncio.wait_for(
                asyncio.shield(future), timeout=max(0.0, deadline - loop.time())
            )
        except TimeoutError:
            return _error("timeout", f"evaluation exceeded {request_timeout_sec:g} s", 504)
        except EvaluationError as exc:
            return _error(exc.code, exc.message, exc.status_code)
        except Exception:
            logger.exception("evaluation failed")
            return _error("internal_error", "the evaluation failed", 500)

    return app


def resolve_bundle_dir(artifact_root: Path, bundle_id: str | None) -> Path:
    """`<artifact_root>/bundles/<bundle_id>`; there is no default bundle."""
    if not bundle_id:
        raise ValueError(
            "no bundle configured: set worker_bundle_id in speech.yaml or pass --bundle-id"
        )
    if not _BUNDLE_ID_RE.match(bundle_id):
        raise ValueError(f"{bundle_id!r} is not a bundle id like speech-evaluator-v0.1.0")
    return artifact_root / "bundles" / bundle_id


def warm_up(pipeline: SpeechEvaluationPipeline) -> None:
    """Run the encoder, the aligner (which extracts its models on first use)
    and the scorer once on a 2 s tone. Startup fails if any of them cannot
    run; the tone's scores are meaningless and discarded."""
    from echolingo_speech.features.cache import TARGET_SAMPLE_RATE

    t = torch.arange(2 * TARGET_SAMPLE_RATE) / TARGET_SAMPLE_RATE
    waveform = (0.1 * torch.sin(2 * math.pi * 220.0 * t)).unsqueeze(0)
    encoded = pipeline.encoder.encode(waveform)
    alignment = pipeline.aligner.align(waveform.squeeze(0).numpy(), TARGET_SAMPLE_RATE, "hello")
    pipeline.score(waveform, encoded, alignment, ["hello"])


def build_pipeline(
    *,
    bundle_dir: Path,
    hf_cache_dir: Path,
    mfa_cache_dir: Path,
    device: str = "cpu",
) -> tuple[SpeechEvaluationPipeline, dict]:
    from echolingo_speech.bundles.bundle import load_bundle
    from echolingo_speech.worker.aligner import MfaAligner
    from echolingo_speech.worker.pipeline import Wav2Vec2Encoder

    bundle = load_bundle(bundle_dir, device=device)
    encoder_schema = bundle.feature_schema["encoder"]
    encoder = Wav2Vec2Encoder(
        encoder_schema["model_id"], encoder_schema["revision"], bundle.hidden_state_layers,
        cache_dir=hf_cache_dir, device=device,
    )
    aligner = MfaAligner(mfa_cache_dir)
    aligner_version = aligner.version()
    pipeline = SpeechEvaluationPipeline(bundle, encoder, aligner)
    warm_up(pipeline)
    return pipeline, {"aligner_version": aligner_version, "device": device}


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.worker.app")
    subparsers = parser.add_subparsers(dest="command", required=True)
    serve = subparsers.add_parser("serve", help="Serve one bundle on worker_host:worker_port")
    serve.add_argument("--config", type=Path, required=True, help="speech.yaml")
    serve.add_argument("--bundle-id", default=None, help="overrides worker_bundle_id")
    serve.add_argument("--device", default="cpu")
    serve.add_argument("--request-timeout-sec", type=float, default=DEFAULT_REQUEST_TIMEOUT_SEC)
    args = parser.parse_args(argv)

    import uvicorn

    from echolingo_speech.config import load_config

    config = load_config(args.config)
    bundle_dir = resolve_bundle_dir(config.artifact_root, args.bundle_id or config.worker_bundle_id)
    logging.basicConfig(level=logging.INFO)
    app = create_app(
        lambda: build_pipeline(
            bundle_dir=bundle_dir,
            hf_cache_dir=config.artifact_root / "hf-cache",
            mfa_cache_dir=config.artifact_root / "mfa-cache",
            device=args.device,
        ),
        request_timeout_sec=args.request_timeout_sec,
    )
    uvicorn.run(app, host=config.worker_host, port=config.worker_port)
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
