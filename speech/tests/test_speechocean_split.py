"""Speaker-stratified split determinism and leakage-freedom, against the synthetic
`speechocean_mini_corpus` fixture (never real corpus audio)."""

from __future__ import annotations

from pathlib import Path

from echolingo_speech.data.manifest import audit_leakage
from echolingo_speech.data.speechocean import (
    _load_split,
    build_manifest,
    stratified_validation_speakers,
)


def test_split_is_deterministic_for_a_fixed_seed(speechocean_mini_corpus: Path):
    train_utterances = _load_split(speechocean_mini_corpus, "train")

    first = stratified_validation_speakers(train_utterances, ratio=0.5, seed=42)
    second = stratified_validation_speakers(train_utterances, ratio=0.5, seed=42)

    assert first == second
    assert first  # non-empty given ratio=0.5 over 8 speakers


def test_different_seeds_can_change_the_split(speechocean_mini_corpus: Path):
    train_utterances = _load_split(speechocean_mini_corpus, "train")

    a = stratified_validation_speakers(train_utterances, ratio=0.5, seed=1)
    b = stratified_validation_speakers(train_utterances, ratio=0.5, seed=2)

    assert a != b


def test_validation_speakers_are_a_subset_of_train_speakers(speechocean_mini_corpus: Path):
    train_utterances = _load_split(speechocean_mini_corpus, "train")
    train_speaker_ids = {utt["speaker_id"] for utt in train_utterances.values()}

    validation_speakers = stratified_validation_speakers(train_utterances, ratio=0.5, seed=42)

    assert set(validation_speakers) <= train_speaker_ids


def test_manifest_has_no_speaker_leakage_across_partitions(speechocean_mini_corpus: Path):
    train_utterances = _load_split(speechocean_mini_corpus, "train")
    validation_speakers = set(
        stratified_validation_speakers(train_utterances, ratio=0.5, seed=42)
    )

    records = build_manifest(
        speechocean_mini_corpus,
        dataset_version="test-version",
        source_url="https://example.invalid/speechocean762.tar.gz",
        validation_speakers=validation_speakers,
        code_version="test-code-version",
    )

    result = audit_leakage(records)
    assert result.ok, result.violations


def test_official_test_speakers_are_never_reassigned(speechocean_mini_corpus: Path):
    train_utterances = _load_split(speechocean_mini_corpus, "train")
    validation_speakers = set(
        stratified_validation_speakers(train_utterances, ratio=0.5, seed=42)
    )

    records = build_manifest(
        speechocean_mini_corpus,
        dataset_version="test-version",
        source_url="https://example.invalid/speechocean762.tar.gz",
        validation_speakers=validation_speakers,
        code_version="test-code-version",
    )

    for record in records:
        if record.official_split == "test":
            assert record.partition == "test"
