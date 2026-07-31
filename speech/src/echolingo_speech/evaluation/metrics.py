"""Multi-metric evaluation for the A0 scorer (roadmap SS7.1).

Sentence level: Pearson/Spearman agreement, MAE, and score-band error.
Word/phoneme level: error-detection Precision/Recall/Macro F1, obtained by
thresholding the continuous accuracy prediction/target into a binary
error/correct label. No single metric here authorizes a promotion decision on
its own (roadmap SS7.1) -- `training/loop.py` reports all of them together.
"""

from __future__ import annotations

import numpy as np


def pearson_correlation(preds: list[float], targets: list[float]) -> float:
    preds_arr = np.asarray(preds, dtype=float)
    targets_arr = np.asarray(targets, dtype=float)
    if preds_arr.std() == 0 or targets_arr.std() == 0:
        # A constant prediction or constant target has no defined correlation;
        # report 0.0 (no agreement) rather than propagate a NaN.
        return 0.0
    return float(np.corrcoef(preds_arr, targets_arr)[0, 1])


def spearman_correlation(preds: list[float], targets: list[float]) -> float:
    return pearson_correlation(_rank(preds), _rank(targets))


def _rank(values: list[float]) -> np.ndarray:
    """Average ranks for tied values (standard Spearman tie-handling)."""
    values_arr = np.asarray(values, dtype=float)
    order = np.argsort(values_arr, kind="stable")
    sorted_values = values_arr[order]
    ranks = np.empty(len(values_arr), dtype=float)

    i = 0
    while i < len(values_arr):
        j = i
        while j + 1 < len(values_arr) and sorted_values[j + 1] == sorted_values[i]:
            j += 1
        ranks[order[i : j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def mean_absolute_error(preds: list[float], targets: list[float]) -> float:
    return float(
        np.mean(np.abs(np.asarray(preds, dtype=float) - np.asarray(targets, dtype=float)))
    )


def score_band_error(preds: list[float], targets: list[float], band_width: float = 1.0) -> float:
    """Fraction of predictions whose absolute error exceeds one score band
    (`band_width` is in whatever scale `preds`/`targets` are passed in --
    callers rescale to the original 0-10 scale before calling this for an
    interpretable band width).
    """
    errors = np.abs(np.asarray(preds, dtype=float) - np.asarray(targets, dtype=float))
    return float(np.mean(errors > band_width))


def error_detection_metrics(
    preds: list[float], targets: list[float], threshold: float = 0.6
) -> dict[str, float]:
    """Threshold continuous accuracy scores into a binary error/correct label,
    then report Precision/Recall/F1 for the "error" class plus the
    macro-average F1 across both classes (roadmap SS7.1's "错误检测
    Precision/Recall/Macro F1"). `threshold` is on the same [0, 1]-normalized
    scale `training/labels.py` produces (0.6 == 6/10 on the original scale).
    """
    preds_arr = np.asarray(preds, dtype=float)
    targets_arr = np.asarray(targets, dtype=float)
    pred_error = preds_arr < threshold
    target_error = targets_arr < threshold

    error_f1, error_precision, error_recall = _binary_f1(pred_error, target_error)
    correct_f1, _, _ = _binary_f1(~pred_error, ~target_error)

    return {
        "precision": error_precision,
        "recall": error_recall,
        "f1": error_f1,
        "macro_f1": (error_f1 + correct_f1) / 2,
    }


def _binary_f1(
    pred_positive: np.ndarray, target_positive: np.ndarray
) -> tuple[float, float, float]:
    true_positive = int(np.sum(pred_positive & target_positive))
    false_positive = int(np.sum(pred_positive & ~target_positive))
    false_negative = int(np.sum(~pred_positive & target_positive))

    predicted_positive = true_positive + false_positive
    actual_positive = true_positive + false_negative
    precision = true_positive / predicted_positive if predicted_positive else 0.0
    recall = true_positive / actual_positive if actual_positive else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return f1, precision, recall
