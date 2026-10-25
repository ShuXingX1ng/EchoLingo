"""Evaluator Checkpoint Bundle export, verification and loading (roadmap SS9.3,
ADR-0013).

A bundle is one immutable directory, `speech-evaluator-v<version>/`, holding
the scoring head's weights and the JSON documents that pin everything else
the Speech Evaluation Worker needs to reproduce training-time features:
encoder revision, layers, raw-waveform input, aligner, label scales,
thresholds, provenance and benchmark results. `bundle.json` lists every other
file with its SHA-256; a bundle whose files differ from that list in any way
is refused, so the Worker can only ever run exactly what was exported.

Export reads one Evaluator Training Run's `best.pt` (a training checkpoint,
`training/checkpoint.py`), its `prediction_thresholds.json`, its MLflow run
directory and the SpeechOcean manifest; it refuses a run whose sealed-test
sentence correlations miss the SS7.2 gate. The encoder weights themselves are
not copied: the Worker downloads the pinned revision.

CLI: `python -m echolingo_speech.bundles.bundle {export,verify}`
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import torch
import yaml

from echolingo_speech.alignment.mfa import ACOUSTIC_MODEL, DICTIONARY
from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import read_jsonl
from echolingo_speech.features.acoustic import FEATURE_NAMES
from echolingo_speech.features.cache import TARGET_SAMPLE_RATE
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.checkpoint import FORMAT_VERSION as CHECKPOINT_FORMAT_VERSION
from echolingo_speech.training.config import TrainingConfig, load_training_config
from echolingo_speech.training.labels import (
    PHONE_SCALE,
    SENTENCE_SCALE,
    SENTENCE_TARGET_KEYS,
    WORD_SCALE,
)

BUNDLE_FORMAT_VERSION = 1
BUNDLE_PREFIX = "speech-evaluator-v"
INDEX_NAME = "bundle.json"
SCORING_HEAD_NAME = "scoring-head.safetensors"
MODEL_CONFIG_NAME = "model-config.json"
FEATURE_SCHEMA_NAME = "feature-schema.json"
LABEL_SCHEMA_NAME = "label-schema.json"
NORMALIZATION_NAME = "normalization.json"
TRAINING_MANIFEST_NAME = "training-manifest.json"
DATASET_MANIFEST_NAME = "dataset-manifest.json"
BENCHMARK_RESULTS_NAME = "benchmark-results.json"
LICENSES_NAME = "LICENSES.md"
BUNDLE_FILES = (
    SCORING_HEAD_NAME,
    MODEL_CONFIG_NAME,
    FEATURE_SCHEMA_NAME,
    LABEL_SCHEMA_NAME,
    NORMALIZATION_NAME,
    TRAINING_MANIFEST_NAME,
    DATASET_MANIFEST_NAME,
    BENCHMARK_RESULTS_NAME,
    LICENSES_NAME,
)
ARCHITECTURE = "SpeechEvaluatorA0"
# SS7.2: sentence accuracy and fluency each correlate at least this well with
# the sealed expert labels before a run may become a bundle.
ACCEPTANCE_MIN_SENTENCE_PEARSON = 0.60
ACCEPTANCE_METRICS = ("sentence_accuracy_pearson", "sentence_fluency_pearson")
ACCEPTANCE_BENCHMARK = "test"

_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
_BENCHMARK_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_SPEECHOCEAN_CONFIG = Path(__file__).resolve().parents[3] / "configs/datasets/speechocean762.yaml"


class BundleError(ValueError):
    """A bundle that must not be exported or loaded."""


def bundle_id_for(version: str) -> str:
    if not _VERSION_RE.match(version):
        raise BundleError(f"bundle version must look like 1.2.3, got {version!r}")
    return f"{BUNDLE_PREFIX}{version}"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# --- export ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MlflowRun:
    run_id: str
    run_name: str
    params: dict[str, str]
    code_revision: str


def read_mlflow_run(run_dir: Path) -> MlflowRun:
    """One run of MLflow's file store (`mlruns/<experiment>/<run_id>/`)."""
    params_dir = run_dir / "params"
    if not params_dir.is_dir():
        raise BundleError(f"{run_dir} is not an MLflow run directory (no params/)")
    params = {path.name: path.read_text(encoding="utf-8").strip() for path in params_dir.iterdir()}
    run_name_tag = run_dir / "tags" / "mlflow.runName"
    run_name = (
        run_name_tag.read_text(encoding="utf-8").strip()
        if run_name_tag.is_file()
        else params.get("run_name", "")
    )
    code_revision = params.get("git_commit", "")
    if not re.fullmatch(r"[0-9a-f]{40}", code_revision):
        raise BundleError(f"{run_dir} records no git_commit param")
    return MlflowRun(run_dir.name, run_name, params, code_revision)


def _dataset_manifest(manifest_path: Path, run: MlflowRun) -> tuple[dict, dict[str, float]]:
    """Dataset provenance and the training audio's duration range. The run's
    own manifest file is identified by the SHA-256 MLflow recorded; the file
    passed here may differ byte-wise (timestamps, absolute paths) but must
    hold the same dataset release, so the partition assignment is stored as
    a content hash that any rebuilt manifest reproduces."""
    dataset_config = yaml.safe_load(_SPEECHOCEAN_CONFIG.read_text(encoding="utf-8"))
    records = read_jsonl(manifest_path)
    tarball_sha256 = dataset_config["tarball_sha256"]
    versions = {record.dataset_version for record in records}
    if versions != {tarball_sha256}:
        raise BundleError(
            f"{manifest_path} holds dataset versions {sorted(versions)}, "
            f"not the frozen release {tarball_sha256}"
        )
    if run.params.get("dataset_version") not in (None, tarball_sha256):
        raise BundleError(
            f"the run trained on dataset version {run.params['dataset_version']}, "
            f"not {tarball_sha256}"
        )

    assignment = "".join(
        f"{sample_id}\t{partition}\n"
        for sample_id, partition in sorted((r.sample_id, r.partition) for r in records)
    )
    partitions: dict[str, dict] = {}
    for partition in ("train", "validation", "test"):
        members = [record for record in records if record.partition == partition]
        partitions[partition] = {
            "utterances": len(members),
            "speakers": len({record.speaker_id for record in members}),
            "utterances_by_age_group": dict(
                sorted(Counter(record.speaker_age_group for record in members).items())
            ),
            "speaker_ids": sorted({record.speaker_id for record in members}),
        }
    durations = [record.audio.duration_sec for record in records if record.partition == "train"]
    source = dataset_config["source"]
    manifest = {
        "datasets": [
            {
                "name": "speechocean762",
                "role": "scoring supervision (train), model selection (validation), "
                "sealed benchmark (test)",
                "origin": source["origin"],
                "resource_id": source["resource_id"],
                "license": source["license"],
                "citation": source["citation"],
                "tarball_sha256": tarball_sha256,
                "training_manifest_sha256": run.params.get("manifest_sha256"),
                "partition_assignment_sha256": hashlib.sha256(assignment.encode()).hexdigest(),
                "split_seed": dataset_config["split"]["seed"],
                "partitions": partitions,
            }
        ]
    }
    return manifest, {"min": min(durations), "max": max(durations)}


def _benchmark_results(benchmarks: dict[str, Path]) -> dict:
    if ACCEPTANCE_BENCHMARK not in benchmarks:
        raise BundleError(
            f"a bundle needs the sealed-test benchmark named {ACCEPTANCE_BENCHMARK!r}"
        )
    results = {}
    for name, path in sorted(benchmarks.items()):
        if not _BENCHMARK_NAME_RE.match(name):
            raise BundleError(f"benchmark names are lowercase words joined by '-', got {name!r}")
        results[name] = {
            "source": path.name,
            "source_sha256": file_sha256(path),
            "metrics": _read_json(path),
        }
    test_metrics = results[ACCEPTANCE_BENCHMARK]["metrics"]
    failing = {
        key: test_metrics.get(key)
        for key in ACCEPTANCE_METRICS
        if not (test_metrics.get(key) or 0.0) >= ACCEPTANCE_MIN_SENTENCE_PEARSON
    }
    if failing:
        raise BundleError(
            f"the run misses the SS7.2 gate (>= {ACCEPTANCE_MIN_SENTENCE_PEARSON} on "
            f"{ACCEPTANCE_BENCHMARK}): {failing}"
        )
    return {
        "acceptance": {
            "benchmark": ACCEPTANCE_BENCHMARK,
            "min_pearson": ACCEPTANCE_MIN_SENTENCE_PEARSON,
            "metrics": {key: test_metrics[key] for key in ACCEPTANCE_METRICS},
        },
        "results": results,
    }


def _feature_schema(
    encoder, training_config: TrainingConfig, duration_range: dict[str, float]
) -> dict:
    return {
        "encoder": {
            "model_id": encoder.model_id,
            "revision": encoder.revision,
            "license": encoder.license,
        },
        "input": {
            "sample_rate": TARGET_SAMPLE_RATE,
            "channels": "mono; multi-channel audio is averaged",
            "resampling": "torchaudio.functional.resample",
            # Training never applied the preprocessor's do_normalize (roadmap
            # SS18.3 step 9); the Worker must not either.
            "waveform_normalization": "none",
        },
        "hidden_state_layers": list(training_config.hidden_state_layers or []),
        "hidden_state_dtype": "float16",
        "acoustic_features": list(FEATURE_NAMES),
        "time_to_frame": "linear over the encoder's output frame count",
        "alignment": {
            "aligner": "montreal-forced-aligner",
            "acoustic_model": ACOUSTIC_MODEL,
            "dictionary": DICTIONARY,
            "text_normalization": "lowercase; every character but letters, digits, "
            "underscore and apostrophe becomes a space",
            "word_alignment_valid": "the aligned word count equals the reference word count",
            "phone_to_word": "a phone belongs to the word whose span holds its midpoint",
        },
        "canonical_phones": {
            "training": "SpeechOcean762 canonical phones, used where MFA's phone count "
            "per word matched",
            "inference": "the dictionary pronunciation MFA aligned",
        },
        "training_audio_duration_sec": duration_range,
    }


def _label_schema(training_config: TrainingConfig) -> dict:
    return {
        "sentence": {
            "targets": list(SENTENCE_TARGET_KEYS),
            "scale": SENTENCE_SCALE,
            "notes": {
                "completeness": "not validated: its sealed-test Pearson is about 0",
            },
        },
        "word": {"accuracy_scale": WORD_SCALE, "stress": "probability the stress is correct"},
        "phone": {"accuracy_scale": PHONE_SCALE},
        "model_output": "every score is a sigmoid on [0, 1]; multiply by its scale",
        "error_label_threshold": training_config.error_detection_threshold,
        "training_targets": (
            "the five experts' mean" if training_config.rater_mean_targets
            else "the official aggregate"
        ),
        "evaluation_labels": "the official aggregate (sentence and word median, phone mean)",
        "calibration": "none: raw model scale, not a PTE 10-90 score",
    }


def _licenses_markdown(encoder, dataset_manifest: dict) -> str:
    dataset = dataset_manifest["datasets"][0]
    return f"""# Licences

This bundle contains only weights trained by EchoLingo and JSON metadata.

- EchoLingo scoring head (`{SCORING_HEAD_NAME}`): in this bundle; trained on
  SpeechOcean762, attribution below.
- SpeechOcean762 (OpenSLR {dataset["resource_id"]}), {dataset["license"]}: training and
  benchmark labels; not in this bundle.
- `{encoder.model_id}` @ `{encoder.revision}`, {encoder.license}: the frozen
  encoder; not in this bundle, downloaded at the pinned revision.
- Montreal Forced Aligner with the `{ACOUSTIC_MODEL}` acoustic model and
  `{DICTIONARY}` dictionary: runtime word and phone alignment; not in this
  bundle, installed in the `aligner` env. See the MFA model cards for their
  licences.

SpeechOcean762: Junbo Zhang et al., "speechocean762: An Open-Source Non-native
English Speech Corpus For Pronunciation Assessment", Interspeech 2021
(`{dataset["citation"]}`). Its scores reflect Mandarin-L1 learners of English;
see the Speech Evaluator roadmap SS7.3 for the validity boundary.

Scores from this bundle are an EchoLingo learning-phase reference, not an
official or PTE-equivalent score.
"""


def _git_head(repo_root: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=repo_root, capture_output=True, text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return result.stdout.strip()


def export_bundle(
    *,
    checkpoint_path: Path,
    training_config_path: Path,
    mlflow_run_dir: Path,
    manifest_path: Path,
    benchmarks: dict[str, Path],
    encoder,
    version: str,
    out_root: Path,
) -> Path:
    """Write `out_root/speech-evaluator-v<version>/` from one accepted run;
    refuses to replace an existing bundle (a new model is a new version)."""
    from safetensors.torch import save_file

    from echolingo_speech.training.loop import read_prediction_thresholds

    bundle_id = bundle_id_for(version)
    target = out_root / bundle_id
    if target.exists():
        raise BundleError(f"{target} already exists; bundles are immutable, bump the version")

    payload = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    if payload.get("format_version") != CHECKPOINT_FORMAT_VERSION:
        raise BundleError(f"{checkpoint_path} is not a training checkpoint")
    if tuple(payload["sentence_target_keys"]) != SENTENCE_TARGET_KEYS:
        raise BundleError(f"{checkpoint_path} predicts {payload['sentence_target_keys']}")
    # Rebuilt through the constructor so keys added since training take their
    # defaults (as `training/checkpoint.py` does).
    model = SpeechEvaluatorA0(**payload["model_config"])
    model.load_state_dict(payload["model_state"])
    model_config = model.config
    if model_config["encoder_adapter"] or model_config["encoder_input_normalized"]:
        raise BundleError(
            "this bundle format carries no adapter weights and only raw encoder input"
        )
    if not model_config["normalize_acoustic_features"]:
        raise BundleError("bundles need a model with stored acoustic feature statistics")

    training_config = load_training_config(training_config_path).model_copy(
        update={"seed": payload["seed"]}
    )
    if TrainingConfig(**payload["training_config"]) != training_config:
        raise BundleError(f"{training_config_path} is not the configuration the run trained with")
    if not training_config.hidden_state_layers or len(
        training_config.hidden_state_layers
    ) != model_config["num_hidden_layers"]:
        raise BundleError("the model's layer count does not match hidden_state_layers")

    thresholds = read_prediction_thresholds(checkpoint_path.parent)
    if thresholds is None or set(thresholds) != {"word", "phone"}:
        raise BundleError(f"{checkpoint_path.parent} has no word/phone prediction_thresholds.json")

    run = read_mlflow_run(mlflow_run_dir)
    if run.params.get("seed") != str(payload["seed"]):
        raise BundleError(
            f"MLflow run {run.run_id} used seed {run.params.get('seed')}, "
            f"the checkpoint {payload['seed']}"
        )
    if run.params.get("encoder_revision") not in (None, encoder.revision):
        raise BundleError(
            f"the run used encoder revision {run.params['encoder_revision']}, "
            f"this config pins {encoder.revision}"
        )
    dataset_manifest, duration_range = _dataset_manifest(manifest_path, run)
    benchmark_results = _benchmark_results(benchmarks)

    out_root.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{bundle_id}-", dir=out_root))
    try:
        state = {key: value.contiguous() for key, value in model.state_dict().items()}
        save_file(state, str(staging / SCORING_HEAD_NAME))
        _write_json(
            staging / MODEL_CONFIG_NAME,
            {
                "architecture": ARCHITECTURE,
                "config": model_config,
                "sentence_target_keys": list(SENTENCE_TARGET_KEYS),
                "prediction_thresholds": thresholds,
            },
        )
        _write_json(
            staging / FEATURE_SCHEMA_NAME, _feature_schema(encoder, training_config, duration_range)
        )
        _write_json(staging / LABEL_SCHEMA_NAME, _label_schema(training_config))
        _write_json(
            staging / NORMALIZATION_NAME,
            {
                "acoustic_features": {
                    "names": list(FEATURE_NAMES),
                    "mean": model.acoustic_mean.tolist(),
                    "std": model.acoustic_std.tolist(),
                    "fitted_on": "train partition (clean audio)",
                }
            },
        )
        _write_json(
            staging / TRAINING_MANIFEST_NAME,
            {
                "run_name": run.run_name,
                "mlflow_run_id": run.run_id,
                "code_revision": run.code_revision,
                "seed": payload["seed"],
                "best_epoch": payload["epoch"],
                "best_validation_loss": payload["best_val_loss"],
                "gpu": run.params.get("gpu_name"),
                "training_config": training_config.model_dump(),
                "source_checkpoint_sha256": file_sha256(checkpoint_path),
                "prediction_thresholds_selected_on": "validation",
            },
        )
        _write_json(staging / DATASET_MANIFEST_NAME, dataset_manifest)
        _write_json(staging / BENCHMARK_RESULTS_NAME, benchmark_results)
        (staging / LICENSES_NAME).write_text(
            _licenses_markdown(encoder, dataset_manifest), encoding="utf-8"
        )
        _write_json(
            staging / INDEX_NAME,
            {
                "format_version": BUNDLE_FORMAT_VERSION,
                "bundle_id": bundle_id,
                "version": version,
                "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
                "exported_by_code_revision": _git_head(Path(__file__).resolve().parents[4]),
                "files": {name: file_sha256(staging / name) for name in BUNDLE_FILES},
            },
        )
        for path in staging.iterdir():
            path.chmod(0o444)
        staging.chmod(0o755)
        os.replace(staging, target)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return target


# --- verification and loading ---------------------------------------------------------


def verify_bundle(bundle_dir: Path) -> dict:
    """Check `bundle_dir` against its `bundle.json` and return that index:
    the format version, the id matching the directory name, and exactly the
    listed files with exactly the listed SHA-256s."""
    index_path = bundle_dir / INDEX_NAME
    if not index_path.is_file():
        raise BundleError(f"{bundle_dir} has no {INDEX_NAME}")
    index = _read_json(index_path)
    if index.get("format_version") != BUNDLE_FORMAT_VERSION:
        raise BundleError(f"{bundle_dir}: unsupported bundle format {index.get('format_version')}")
    if index.get("bundle_id") != bundle_dir.name:
        raise BundleError(f"{bundle_dir} holds bundle {index.get('bundle_id')!r}")
    listed = index.get("files", {})
    if set(listed) != set(BUNDLE_FILES):
        raise BundleError(f"{bundle_dir}: {INDEX_NAME} lists {sorted(listed)}")
    present = {path.name for path in bundle_dir.iterdir()} - {INDEX_NAME}
    if present != set(BUNDLE_FILES):
        raise BundleError(
            f"{bundle_dir}: unexpected or missing files "
            f"{sorted(present.symmetric_difference(BUNDLE_FILES))}"
        )
    for name, expected in listed.items():
        actual = file_sha256(bundle_dir / name)
        if actual != expected:
            raise BundleError(
                f"{bundle_dir / name} has SHA-256 {actual[:12]}, expected {expected[:12]}"
            )
    return index


@dataclass(frozen=True)
class LoadedBundle:
    bundle_id: str
    model: SpeechEvaluatorA0
    prediction_thresholds: dict[str, float]
    feature_schema: dict
    label_schema: dict
    index: dict

    @property
    def hidden_state_layers(self) -> tuple[int, ...]:
        return tuple(self.feature_schema["hidden_state_layers"])


def load_bundle(bundle_dir: Path, *, device: str = "cpu") -> LoadedBundle:
    """Verify `bundle_dir` and rebuild its scorer in eval mode."""
    from safetensors.torch import load_file

    index = verify_bundle(bundle_dir)
    model_config = _read_json(bundle_dir / MODEL_CONFIG_NAME)
    if model_config.get("architecture") != ARCHITECTURE:
        raise BundleError(f"{bundle_dir}: unknown architecture {model_config.get('architecture')}")
    if tuple(model_config["sentence_target_keys"]) != SENTENCE_TARGET_KEYS:
        raise BundleError(f"{bundle_dir} predicts {model_config['sentence_target_keys']}")
    feature_schema = _read_json(bundle_dir / FEATURE_SCHEMA_NAME)
    if feature_schema["input"]["waveform_normalization"] != "none":
        raise BundleError(f"{bundle_dir}: only raw-waveform bundles are supported")
    if feature_schema["input"]["sample_rate"] != TARGET_SAMPLE_RATE:
        raise BundleError(f"{bundle_dir} expects {feature_schema['input']['sample_rate']} Hz")
    if feature_schema["acoustic_features"] != list(FEATURE_NAMES):
        raise BundleError(
            f"{bundle_dir} expects acoustic features {feature_schema['acoustic_features']}"
        )

    model = SpeechEvaluatorA0(**model_config["config"])
    if model.config != model_config["config"]:
        raise BundleError(f"{bundle_dir}: model config has unknown keys")
    if len(feature_schema["hidden_state_layers"]) != model.config["num_hidden_layers"]:
        raise BundleError(f"{bundle_dir}: layer count does not match the model")
    model.load_state_dict(load_file(str(bundle_dir / SCORING_HEAD_NAME)))
    normalization = _read_json(bundle_dir / NORMALIZATION_NAME)["acoustic_features"]
    for name in ("mean", "std"):
        stored = torch.tensor(normalization[name], dtype=torch.float32)
        if not torch.allclose(stored, getattr(model, f"acoustic_{name}")):
            raise BundleError(f"{bundle_dir}: {NORMALIZATION_NAME} {name} differs from the weights")
    model.to(device)
    model.eval()
    return LoadedBundle(
        bundle_id=index["bundle_id"],
        model=model,
        prediction_thresholds=dict(model_config["prediction_thresholds"]),
        feature_schema=feature_schema,
        label_schema=_read_json(bundle_dir / LABEL_SCHEMA_NAME),
        index=index,
    )


# --- CLI ------------------------------------------------------------------------------


def _parse_benchmarks(values: list[str]) -> dict[str, Path]:
    benchmarks: dict[str, Path] = {}
    for value in values:
        name, sep, path = value.partition("=")
        if not sep or not path:
            raise BundleError(f"--benchmark takes name=path, got {value!r}")
        if name in benchmarks:
            raise BundleError(f"benchmark {name!r} given twice")
        benchmarks[name] = Path(path)
    return benchmarks


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.bundles.bundle")
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export", help="Export one accepted run as a bundle")
    export_parser.add_argument("--config", type=Path, required=True, help="speech.yaml")
    export_parser.add_argument("--checkpoint", type=Path, required=True, help="the run's best.pt")
    export_parser.add_argument("--training-config", type=Path, required=True)
    export_parser.add_argument("--mlflow-run-dir", type=Path, required=True)
    export_parser.add_argument("--manifest", type=Path, required=True)
    export_parser.add_argument(
        "--benchmark", action="append", default=[], metavar="NAME=PATH",
        help=f"an `evaluate --out` JSON; {ACCEPTANCE_BENCHMARK!r} (sealed test) is required",
    )
    export_parser.add_argument("--version", required=True, help="e.g. 0.1.0")
    export_parser.add_argument(
        "--out-root", type=Path, default=None, help="default: <artifact_root>/bundles"
    )

    verify_parser = subparsers.add_parser("verify", help="Check a bundle against bundle.json")
    verify_parser.add_argument("--bundle", type=Path, required=True)

    args = parser.parse_args(argv)
    try:
        if args.command == "export":
            config = load_config(args.config)
            target = export_bundle(
                checkpoint_path=args.checkpoint,
                training_config_path=args.training_config,
                mlflow_run_dir=args.mlflow_run_dir,
                manifest_path=args.manifest,
                benchmarks=_parse_benchmarks(args.benchmark),
                encoder=config.encoder,
                version=args.version,
                out_root=args.out_root or config.artifact_root / "bundles",
            )
            print(f"OK: exported {target}")
            return 0
        if args.command == "verify":
            index = verify_bundle(args.bundle)
            print(f"OK: {index['bundle_id']} ({len(index['files'])} files match bundle.json)")
            return 0
    except BundleError as exc:
        print(f"REFUSED: {exc}")
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(_cli())
