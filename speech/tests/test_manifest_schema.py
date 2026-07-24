"""Manifest record schema validation and JSONL round-trip."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from echolingo_speech.data.manifest import (
    AudioInfo,
    DerivationInfo,
    ManifestRecord,
    SourceInfo,
    audit_leakage,
    read_jsonl,
    write_jsonl,
)


def _sample_record(**overrides) -> ManifestRecord:
    defaults = dict(
        sample_id="SPEAKER0001_0001000",
        dataset="speechocean762",
        dataset_version="deadbeef",
        source=SourceInfo(
            origin="openslr",
            resource_id=101,
            url="https://example.invalid/speechocean762.tar.gz",
            license="CC-BY-4.0",
            citation="zhang2021speechocean762",
        ),
        speaker_id="0001",
        speaker_age_group="adult",
        speaker_gender="m",
        official_split="train",
        partition="train",
        consent_class="public_licensed_corpus",
        audio=AudioInfo(
            relative_path="WAVE/SPEAKER0001/0001000.WAV",
            sha256="abc123",
            duration_sec=1.2,
            sample_rate=16000,
        ),
        text_reference="the quick brown fox",
        scores={"sentence": {"total": 7}, "words": []},
        derivation=DerivationInfo(
            code_version="deadbeef", generated_at="2026-07-23T00:00:00+00:00"
        ),
    )
    defaults.update(overrides)
    return ManifestRecord(**defaults)


def test_manifest_record_round_trips_through_jsonl(tmp_path: Path):
    records = [_sample_record()]
    path = tmp_path / "manifest.jsonl"

    write_jsonl(path, records)
    loaded = read_jsonl(path)

    assert loaded == records


def test_manifest_record_rejects_missing_required_field():
    with pytest.raises(ValidationError):
        ManifestRecord(sample_id="incomplete")


def test_audit_leakage_passes_on_clean_manifest():
    result = audit_leakage([_sample_record()])
    assert result.ok
    assert result.violations == []


def test_audit_leakage_flags_speaker_spanning_partitions():
    train_record = _sample_record(sample_id="a", official_split="train", partition="train")
    validation_record = _sample_record(
        sample_id="b", official_split="train", partition="validation"
    )

    result = audit_leakage([train_record, validation_record])

    assert not result.ok
    assert any("spans partitions" in v for v in result.violations)


def test_audit_leakage_flags_test_partition_mismatch():
    mislabeled = _sample_record(official_split="train", partition="test")

    result = audit_leakage([mislabeled])

    assert not result.ok
    assert any("official_split" in v for v in result.violations)
