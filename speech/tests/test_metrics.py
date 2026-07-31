"""Evaluation metric tests against synthetic prediction/target arrays (no
real data or GPU required)."""

from __future__ import annotations

import pytest

from echolingo_speech.evaluation.metrics import (
    error_detection_metrics,
    mean_absolute_error,
    pearson_correlation,
    score_band_error,
    spearman_correlation,
)


def test_pearson_correlation_is_one_for_perfectly_linear_agreement():
    preds = [0.1, 0.4, 0.7, 1.0]
    targets = [0.2, 0.5, 0.8, 1.1]
    assert pearson_correlation(preds, targets) == pytest.approx(1.0)


def test_pearson_correlation_is_zero_for_constant_prediction():
    assert pearson_correlation([0.5, 0.5, 0.5], [0.1, 0.5, 0.9]) == 0.0


def test_spearman_correlation_is_one_for_monotonic_nonlinear_agreement():
    preds = [1, 2, 3, 4]
    targets = [1, 4, 9, 16]  # nonlinear but monotonic -> spearman 1, pearson < 1
    assert spearman_correlation(preds, targets) == pytest.approx(1.0)
    assert pearson_correlation(preds, targets) < 1.0


def test_spearman_correlation_handles_ties_via_average_rank():
    preds = [1, 1, 2, 3]
    targets = [1, 1, 2, 3]
    assert spearman_correlation(preds, targets) == pytest.approx(1.0)


def test_mean_absolute_error_basic():
    assert mean_absolute_error([1.0, 2.0, 3.0], [1.0, 2.0, 5.0]) == pytest.approx(2.0 / 3)


def test_score_band_error_counts_fraction_exceeding_band_width():
    preds = [5.0, 5.0, 5.0, 5.0]
    targets = [5.5, 6.5, 5.0, 4.0]  # errors: 0.5, 1.5, 0.0, 1.0
    assert score_band_error(preds, targets, band_width=1.0) == pytest.approx(0.25)


def test_error_detection_metrics_perfect_agreement():
    preds = [0.9, 0.4, 0.2, 0.8]
    targets = [0.9, 0.3, 0.1, 0.7]  # same side of threshold=0.6 for every sample
    metrics = error_detection_metrics(preds, targets, threshold=0.6)

    assert metrics["precision"] == pytest.approx(1.0)
    assert metrics["recall"] == pytest.approx(1.0)
    assert metrics["f1"] == pytest.approx(1.0)
    assert metrics["macro_f1"] == pytest.approx(1.0)


def test_error_detection_metrics_penalizes_false_positive():
    preds = [0.4, 0.9]  # predicts sample 0 as error, sample 1 as correct
    targets = [0.9, 0.9]  # both actually correct
    metrics = error_detection_metrics(preds, targets, threshold=0.6)

    assert metrics["precision"] == pytest.approx(0.0)  # the predicted error was a false positive
    assert metrics["recall"] == pytest.approx(0.0)  # no actual errors to recall (0/0 -> 0.0)
