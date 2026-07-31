"""Constant-mean baseline tests against tiny synthetic `ScoringExample`s (no
real data), mirroring `tests/test_loop.py`'s fixture style so results are
directly comparable to what `evaluate` would report for the same examples."""

from __future__ import annotations

import pytest
import torch

from echolingo_speech.evaluation.baseline import constant_mean_baseline_metrics
from echolingo_speech.training.dataset import PhoneExample, ScoringExample, WordExample


def _make_example(
    sample_id: str, accuracy: float, *, word_alignment_valid: bool = True
) -> ScoringExample:
    return ScoringExample(
        sample_id=sample_id,
        hidden_states=torch.randn(10, 768),
        sentence_targets=torch.tensor([accuracy, 1.0 - accuracy, accuracy, 1.0]),
        acoustic_features=torch.randn(9),
        word_examples=[WordExample(0, 3, accuracy, 1.0), WordExample(3, 6, 1.0 - accuracy, 0.0)],
        phone_examples=[PhoneExample(0, 1, accuracy * 2), PhoneExample(1, 2, (1.0 - accuracy) * 2)],
        word_alignment_valid=word_alignment_valid,
    )


def test_baseline_predicts_training_mean_for_every_test_example():
    train_examples = [_make_example(f"train{i}", accuracy) for i, accuracy in enumerate([0.4, 0.6])]
    test_examples = [_make_example("test0", 1.0)]

    metrics = constant_mean_baseline_metrics(
        train_examples, test_examples, score_band_width=1.0, error_detection_threshold=0.6
    )

    # Training mean accuracy is 0.5 -> 5.0 on the original 0-10 scale; the
    # single test target is 1.0 -> 10.0, so MAE is exactly the gap.
    assert metrics["sentence_accuracy_mae"] == pytest.approx(5.0)


def test_baseline_excludes_examples_with_invalid_word_alignment():
    train_examples = [_make_example("train0", 0.5, word_alignment_valid=False)]
    test_examples = [_make_example("test0", 0.5, word_alignment_valid=False)]

    metrics = constant_mean_baseline_metrics(
        train_examples, test_examples, score_band_width=1.0, error_detection_threshold=0.6
    )

    assert "word_accuracy_mae" not in metrics
    assert "phone_accuracy_mae" in metrics  # phones aren't gated by word_alignment_valid


def test_baseline_reports_error_detection_for_word_and_phone_levels():
    train_examples = [_make_example(f"train{i}", accuracy) for i, accuracy in enumerate([0.2, 0.9])]
    test_examples = [_make_example("test0", 0.9)]

    metrics = constant_mean_baseline_metrics(
        train_examples, test_examples, score_band_width=1.0, error_detection_threshold=0.6
    )

    assert set(metrics["word_error_detection"]) == {"precision", "recall", "f1", "macro_f1"}
    assert set(metrics["phone_error_detection"]) == {"precision", "recall", "f1", "macro_f1"}
