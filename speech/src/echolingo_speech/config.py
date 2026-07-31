"""Load and validate speech/configs/speech.yaml.

Provides the SpeechConfig model plus the
`python -m echolingo_speech.config validate --config <path>` CLI used by
the M0 smoke test and by day-to-day environment checks.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml
from pydantic import BaseModel, field_validator

_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")


class EncoderConfig(BaseModel):
    model_id: str
    revision: str
    license: str | None = None
    hidden_size: int | None = None

    @field_validator("model_id")
    @classmethod
    def _model_id_not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("encoder model_id must not be empty")
        return value

    @field_validator("revision")
    @classmethod
    def _revision_is_pinned_commit(cls, value: str) -> str:
        if not _REVISION_RE.match(value):
            raise ValueError(f"encoder revision must be a 40-character commit sha, got {value!r}")
        return value


class SpeechConfig(BaseModel):
    data_root: Path
    artifact_root: Path
    mlflow_tracking_uri: str
    worker_host: str = "localhost"
    worker_port: int = 8100
    encoder: EncoderConfig

    @field_validator("data_root", "artifact_root")
    @classmethod
    def _root_must_exist_and_be_writable(cls, value: Path) -> Path:
        resolved = value.expanduser()
        if not resolved.is_dir():
            raise ValueError(f"path does not exist or is not a directory: {resolved}")
        probe = resolved / ".write_check"
        try:
            probe.touch()
            probe.unlink()
        except OSError as exc:
            raise ValueError(f"path is not writable: {resolved} ({exc})") from exc
        return resolved


def load_config(config_path: Path) -> SpeechConfig:
    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if raw is None:
        raise ValueError(f"config file is empty: {config_path}")

    encoder_config_path = raw.pop("encoder_config_path", None)
    if not encoder_config_path:
        raise ValueError("speech.yaml must set encoder_config_path")

    encoder_path = (config_path.parent / encoder_config_path).resolve()
    if not encoder_path.is_file():
        raise ValueError(f"encoder_config_path does not exist: {encoder_path}")

    raw["encoder"] = yaml.safe_load(encoder_path.read_text(encoding="utf-8"))
    return SpeechConfig(**raw)


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.config")
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate = subparsers.add_parser("validate", help="Validate a speech.yaml config file")
    validate.add_argument("--config", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command != "validate":
        return 1

    try:
        config = load_config(args.config)
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as a CLI error
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1

    print(f"OK: {args.config}")
    print(f"  data_root:     {config.data_root}")
    print(f"  artifact_root: {config.artifact_root}")
    print(f"  mlflow:        {config.mlflow_tracking_uri}")
    print(f"  worker:        {config.worker_host}:{config.worker_port}")
    print(f"  encoder:       {config.encoder.model_id}@{config.encoder.revision}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
