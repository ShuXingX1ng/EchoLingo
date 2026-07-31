"""Label normalization and alignment-validity rule tests, against synthetic
score dicts shaped like the real speechocean762 manifest (never real data)."""

from __future__ import annotations

import pytest

from echolingo_speech.training.labels import (
    normalize_phone_accuracy,
    normalize_sentence_scores,
    normalize_word_score,
    phone_alignment_is_valid,
    word_alignment_is_valid,
)


def test_normalize_sentence_scores_maps_zero_to_ten_scale_to_unit_interval():
    sentence = {"accuracy": 8, "fluency": 9, "prosodic": 9, "completeness": 10.0, "total": 8}

    normalized = normalize_sentence_scores(sentence)

    assert normalized == {"accuracy": 0.8, "fluency": 0.9, "prosodic": 0.9, "completeness": 1.0}


def test_normalize_sentence_scores_handles_low_scores():
    sentence = {"accuracy": 1, "fluency": 0, "prosodic": 0, "completeness": 0.0, "total": 0}

    normalized = normalize_sentence_scores(sentence)

    assert normalized == {"accuracy": 0.1, "fluency": 0.0, "prosodic": 0.0, "completeness": 0.0}


def test_normalize_word_score_maps_correct_stress_to_one():
    word = {"accuracy": 10, "stress": 10, "total": 10}

    normalized = normalize_word_score(word)

    assert normalized == {"accuracy": 1.0, "stress": 1.0}


def test_normalize_word_score_maps_misplaced_stress_to_zero():
    word = {"accuracy": 6, "stress": 5, "total": 6}

    normalized = normalize_word_score(word)

    assert normalized == {"accuracy": 0.6, "stress": 0.0}


def test_normalize_word_score_rejects_unexpected_stress_value():
    word = {"accuracy": 6, "stress": 7, "total": 6}

    with pytest.raises(ValueError, match="unexpected word stress value"):
        normalize_word_score(word)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(2.0, 1.0), (1.8, 0.9), (0.0, 0.0), (1.0, 0.5)],
)
def test_normalize_phone_accuracy_maps_zero_to_two_scale_to_unit_interval(raw, expected):
    assert normalize_phone_accuracy(raw) == expected


def test_word_alignment_is_valid_requires_exact_count_match():
    assert word_alignment_is_valid(mfa_word_count=4, reference_word_count=4)
    assert not word_alignment_is_valid(mfa_word_count=3, reference_word_count=4)


def test_phone_alignment_is_valid_requires_exact_count_match():
    assert phone_alignment_is_valid(mfa_phone_count=3, canonical_phone_count=3)
    assert not phone_alignment_is_valid(mfa_phone_count=2, canonical_phone_count=3)
