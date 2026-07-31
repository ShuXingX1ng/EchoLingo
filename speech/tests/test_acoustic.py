"""Acoustic feature extraction tests against synthetic waveforms and hand-built
word spans (never real corpus audio)."""

from __future__ import annotations

import math

import pytest
import torch

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.features.acoustic import (
    FEATURE_NAMES,
    compute_acoustic_features,
    feature_vector,
)

SAMPLE_RATE = 16000


def _sine_waveform(duration_sec: float, freq: float = 220.0) -> torch.Tensor:
    t = torch.linspace(0, duration_sec, int(SAMPLE_RATE * duration_sec))
    return (0.1 * torch.sin(2 * math.pi * freq * t)).unsqueeze(0)


def test_pause_features_ignore_leading_trailing_silence_and_subthreshold_gaps():
    # word0 [0.0,0.3], tiny 20ms gap (below threshold), word1 [0.32,0.6],
    # real 200ms pause, word2 [0.8,1.0].
    word_spans = [
        TextGridSpan(0.0, 0.3, "a"),
        TextGridSpan(0.32, 0.6, "b"),
        TextGridSpan(0.8, 1.0, "c"),
    ]
    waveform = _sine_waveform(1.0)

    features = compute_acoustic_features(
        waveform, word_spans, duration_sec=1.0, reference_word_count=3
    )

    assert features["pause_count"] == 1.0
    assert features["longest_pause_sec"] == pytest.approx(0.2)
    assert features["pause_ratio"] == pytest.approx(0.2)


def test_pause_features_are_zero_with_fewer_than_two_words():
    features_empty = compute_acoustic_features(
        _sine_waveform(1.0), [], duration_sec=1.0, reference_word_count=0
    )
    features_one = compute_acoustic_features(
        _sine_waveform(1.0),
        [TextGridSpan(0.0, 0.5, "a")],
        duration_sec=1.0,
        reference_word_count=1,
    )

    for features in (features_empty, features_one):
        assert features["pause_count"] == 0.0
        assert features["pause_ratio"] == 0.0
        assert features["longest_pause_sec"] == 0.0


def test_speech_rate_is_reference_word_count_over_duration():
    features = compute_acoustic_features(
        _sine_waveform(2.0), [], duration_sec=2.0, reference_word_count=4
    )

    assert features["speech_rate_wps"] == pytest.approx(2.0)


def test_word_duration_std_reflects_uneven_word_lengths():
    uniform_spans = [
        TextGridSpan(0.0, 0.3, "a"),
        TextGridSpan(0.3, 0.6, "b"),
        TextGridSpan(0.6, 0.9, "c"),
    ]
    uneven_spans = [
        TextGridSpan(0.0, 0.1, "a"),
        TextGridSpan(0.1, 0.8, "b"),
        TextGridSpan(0.8, 0.9, "c"),
    ]

    uniform = compute_acoustic_features(
        _sine_waveform(0.9), uniform_spans, duration_sec=0.9, reference_word_count=3
    )
    uneven = compute_acoustic_features(
        _sine_waveform(0.9), uneven_spans, duration_sec=0.9, reference_word_count=3
    )

    assert uniform["word_duration_std_sec"] == pytest.approx(0.0, abs=1e-9)
    assert uneven["word_duration_std_sec"] > uniform["word_duration_std_sec"]


def test_pitch_and_energy_features_are_finite_for_a_real_tone():
    features = compute_acoustic_features(
        _sine_waveform(1.0),
        [TextGridSpan(0.0, 1.0, "a")],
        duration_sec=1.0,
        reference_word_count=1,
    )

    assert math.isfinite(features["pitch_mean_hz"])
    assert math.isfinite(features["pitch_std_hz"])
    assert features["energy_mean"] > 0.0
    assert math.isfinite(features["energy_std"])


def test_feature_vector_matches_declared_order():
    features = compute_acoustic_features(
        _sine_waveform(1.0),
        [TextGridSpan(0.0, 1.0, "a")],
        duration_sec=1.0,
        reference_word_count=1,
    )

    vector = feature_vector(features)

    assert vector == [features[name] for name in FEATURE_NAMES]
