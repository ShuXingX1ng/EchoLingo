"""Resolve and validate the speech data root and artifact root directory structure.

Constants here define the on-disk contract described in
docs/SPEECH_EVALUATOR_ROADMAP.md SS4.3 and SS9.3; this module only checks
structure, it never creates or deletes speech data.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

DATA_SUBDIRS = ("raw", "processed", "benchmarks", "consented")
ARTIFACT_SUBDIRS = ("hf-cache", "mlruns", "bundles")


@dataclass(frozen=True)
class SpeechPaths:
    data_root: Path
    artifact_root: Path

    @property
    def raw(self) -> Path:
        return self.data_root / "raw"

    @property
    def processed(self) -> Path:
        return self.data_root / "processed"

    @property
    def benchmarks(self) -> Path:
        return self.data_root / "benchmarks"

    @property
    def consented(self) -> Path:
        return self.data_root / "consented"

    @property
    def hf_cache(self) -> Path:
        return self.artifact_root / "hf-cache"

    @property
    def mlruns(self) -> Path:
        return self.artifact_root / "mlruns"

    @property
    def bundles(self) -> Path:
        return self.artifact_root / "bundles"

    def missing_subdirs(self) -> list[Path]:
        expected = [self.data_root / name for name in DATA_SUBDIRS]
        expected += [self.artifact_root / name for name in ARTIFACT_SUBDIRS]
        return [path for path in expected if not path.is_dir()]
