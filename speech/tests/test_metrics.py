"""Evaluation metric tests against synthetic prediction/target arrays (no
real data or GPU required)."""

from __future__ import annotations

import pytest

from echolingo_speech.evaluation.metrics import (
    average_precision,
    error_detection_metrics,
    mean_absolute_error,
    pearson_correlation,
    score_band_error,
    select_prediction_threshold,
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


def test_error_detection_splits_predictions_at_their_own_threshold():
    # Labels split at 0.6, predictions at 0.75: the 0.7 prediction now flags.
    preds = [0.70, 0.90]
    targets = [0.20, 0.90]
    assert error_detection_metrics(preds, targets, threshold=0.6)["recall"] == 0.0
    metrics = error_detection_metrics(preds, targets, threshold=0.6, prediction_threshold=0.75)
    assert metrics["macro_f1"] == pytest.approx(1.0)


def test_average_precision_ranks_low_predictions_as_errors():
    # Errors (targets < 0.6) get the lowest predictions -> perfect ranking.
    assert average_precision([0.1, 0.2, 0.9], [0.3, 0.4, 1.0]) == pytest.approx(1.0)
    # Ranked by 1 - pred: correct, error, error -> precision 1/2 then 2/3.
    assert average_precision([0.1, 0.2, 0.3], [1.0, 0.4, 0.4]) == pytest.approx(
        (1 / 2 + 2 / 3) / 2
    )
    assert average_precision([0.5], [1.0]) == 0.0


def test_average_precision_of_a_constant_predictor_is_the_error_rate():
    assert average_precision([0.8] * 4, [0.2, 1.0, 1.0, 1.0]) == pytest.approx(0.25)


def test_select_prediction_threshold_separates_predictions_above_the_label_cut():
    # Every prediction is above 0.6, yet they still rank the errors first.
    preds = [0.70, 0.72, 0.90, 0.95]
    targets = [0.2, 0.3, 0.9, 1.0]
    cut = select_prediction_threshold(preds, targets, threshold=0.6)
    assert 0.72 < cut < 0.90
    assert error_detection_metrics(preds, targets, 0.6, cut)["macro_f1"] == pytest.approx(1.0)
