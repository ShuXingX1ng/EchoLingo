"""Human-readable environment self-check: python -m echolingo_speech.env_check.

Reports Python/torch/CUDA/GPU status, key dependency versions, config
validity, and directory structure. Never trains a model or downloads a
dataset.
"""

from __future__ import annotations

import argparse
import importlib.metadata as metadata
import sys
from pathlib import Path

from echolingo_speech.config import load_config
from echolingo_speech.paths import SpeechPaths


def _line(label: str, value: str) -> None:
    print(f"  {label:<14} {value}")


def _check_torch() -> bool:
    try:
        import torch
    except ImportError as exc:
        _line("torch", f"NOT AVAILABLE ({exc})")
        return False

    _line("torch", torch.__version__)
    cuda_available = torch.cuda.is_available()
    _line("cuda available", str(cuda_available))
    if cuda_available:
        _line("cuda device", torch.cuda.get_device_name(0))
        total_mem_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        _line("cuda memory", f"{total_mem_gb:.1f} GiB")
    return cuda_available


def _check_dependency_versions() -> None:
    for package in ("transformers", "mlflow", "pydantic", "soundfile"):
        try:
            _line(package, metadata.version(package))
        except metadata.PackageNotFoundError:
            _line(package, "NOT INSTALLED")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.env_check")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "configs" / "speech.yaml",
    )
    args = parser.parse_args(argv)

    print("EchoLingo speech environment check")
    print("-----------------------------------")
    print(f"python: {sys.version.split()[0]}")

    _check_dependency_versions()
    cuda_ok = _check_torch()

    print()
    if not args.config.is_file():
        print(f"config: MISSING ({args.config}); copy configs/speech.example.yaml")
        return 1

    try:
        config = load_config(args.config)
    except Exception as exc:  # noqa: BLE001 - reported to the operator, not swallowed
        print(f"config: INVALID ({exc})")
        return 1

    print(f"config: OK ({args.config})")
    paths = SpeechPaths(data_root=config.data_root, artifact_root=config.artifact_root)
    missing = paths.missing_subdirs()
    if missing:
        print("directory structure: MISSING")
        for path in missing:
            print(f"  - {path}")
        return 1
    print("directory structure: OK")

    print()
    if not cuda_ok:
        print("RESULT: environment incomplete (no CUDA GPU detected)")
        return 1
    print("RESULT: environment OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
