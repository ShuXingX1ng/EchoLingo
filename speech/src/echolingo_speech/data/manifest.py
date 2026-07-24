"""Speech Dataset Manifest record schema and JSONL I/O.

The manifest is the single source of truth ADR-0011 requires per sample: identity and
hash, dataset/source/licence, speaker partition, consent class, and the derivation
steps and code version that produced it. `alignment` and `features` fields start
absent and are filled in by later pipeline stages (`alignment/mfa.py`,
`features/cache.py`) writing back into the same JSONL file.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

OFFICIAL_SPLITS = ("train", "test")
PARTITIONS = ("train", "validation", "test")
AGE_GROUPS = ("adult", "child")
GENDERS = ("m", "f")
ALIGNMENT_STATUSES = ("aligned", "degraded", "failed")


class SourceInfo(BaseModel):
    origin: str
    resource_id: int
    url: str
    license: str
    citation: str


class AudioInfo(BaseModel):
    relative_path: str
    sha256: str
    duration_sec: float
    sample_rate: int


class AlignmentInfo(BaseModel):
    status: str
    textgrid_relative_path: str | None = None
    oov_word_count: int = 0
    unaligned_word_count: int = 0
    quality_score: float | None = None


class FeatureInfo(BaseModel):
    waveform_cache_path: str
    wav2vec2_hidden_state_path: str
    encoder_revision: str
    code_version: str


class DerivationInfo(BaseModel):
    code_version: str
    generated_at: str


class ManifestRecord(BaseModel):
    sample_id: str
    dataset: str
    dataset_version: str
    source: SourceInfo
    speaker_id: str
    speaker_age_group: str
    speaker_gender: str
    official_split: str
    partition: str
    consent_class: str
    audio: AudioInfo
    text_reference: str
    scores: dict
    alignment: AlignmentInfo | None = None
    features: FeatureInfo | None = None
    derivation: DerivationInfo


class LeakageAuditResult(BaseModel):
    ok: bool
    violations: list[str]


def read_jsonl(path: Path) -> list[ManifestRecord]:
    records: list[ManifestRecord] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            records.append(ManifestRecord.model_validate_json(line))
    return records


def write_jsonl(path: Path, records: list[ManifestRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(record.model_dump_json())
            handle.write("\n")


def audit_leakage(records: list[ManifestRecord]) -> LeakageAuditResult:
    """Speaker-independent split invariants:

    - No speaker id spans more than one partition.
    - `partition == "test"` if and only if `official_split == "test"` (the sealed
      benchmark is exactly the official test set, never trimmed or extended).
    """
    violations: list[str] = []
    speaker_to_partitions: dict[str, set[str]] = {}
    for record in records:
        speaker_to_partitions.setdefault(record.speaker_id, set()).add(record.partition)
        if (record.partition == "test") != (record.official_split == "test"):
            violations.append(
                f"sample {record.sample_id}: partition={record.partition!r} "
                f"but official_split={record.official_split!r}"
            )

    for speaker_id, partitions in speaker_to_partitions.items():
        if len(partitions) > 1:
            violations.append(f"speaker {speaker_id} spans partitions {sorted(partitions)}")

    return LeakageAuditResult(ok=not violations, violations=violations)
