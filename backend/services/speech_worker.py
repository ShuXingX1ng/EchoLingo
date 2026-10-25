"""
Speech Evaluation Worker client

The private Worker (`speech/src/echolingo_speech/worker/`, ADR-0013/0015)
runs the EchoLingo Speech Evaluator; only this backend calls it. This module
is the HTTP boundary and nothing more: it returns the Worker's own result
(label-scale scores, evidence status per level) and turns every way the call
can fail into a `SpeechProviderError` with a stable code. The backend gains
no model dependency.

Configuration: `SPEECH_WORKER_URL` (default http://localhost:8100) and
`SPEECH_WORKER_TIMEOUT_SEC` (default 30, ADR-0012's synchronous budget; the
Worker's own request budget is 25 s).
"""

import os
from typing import Optional

import httpx

DEFAULT_WORKER_URL = "http://localhost:8100"
DEFAULT_TIMEOUT_SEC = 30.0


class SpeechProviderError(Exception):
    """A provider produced no result. `code` is a stable identifier: the
    Worker's own error code when it refused the recording, otherwise one of
    `worker_unavailable`, `timeout`, `worker_error`, `calibration_missing`,
    `provider_error`."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def worker_url() -> str:
    return os.getenv("SPEECH_WORKER_URL", DEFAULT_WORKER_URL).rstrip("/")


def worker_timeout() -> float:
    return float(os.getenv("SPEECH_WORKER_TIMEOUT_SEC", DEFAULT_TIMEOUT_SEC))


async def evaluate(
    audio: bytes, reference_text: str, *, transport: Optional[httpx.AsyncBaseTransport] = None
) -> dict:
    """POST the recording to the Worker's `/v1/evaluate`; its JSON result."""
    try:
        async with httpx.AsyncClient(timeout=worker_timeout(), transport=transport) as client:
            response = await client.post(
                f"{worker_url()}/v1/evaluate",
                files={"audio": ("recording.wav", audio, "audio/wav")},
                data={"reference_text": reference_text, "task_type": "read_aloud"},
            )
    except httpx.TimeoutException as exc:
        raise SpeechProviderError("timeout", "the Speech Evaluation Worker timed out") from exc
    except httpx.TransportError as exc:
        raise SpeechProviderError(
            "worker_unavailable", f"the Speech Evaluation Worker is unreachable: {exc}"
        ) from exc

    if response.status_code != 200:
        try:
            error = response.json()["error"]
            code, message = str(error["code"]), str(error["message"])
        except (ValueError, KeyError, TypeError):
            code, message = "worker_error", f"the Worker answered HTTP {response.status_code}"
        raise SpeechProviderError(code, message)
    try:
        return response.json()
    except ValueError as exc:
        raise SpeechProviderError("worker_error", "the Worker returned invalid JSON") from exc
