"""Assemble the roadmap SS7.1 metric report from prediction/target pairs.

Both the trained scorer (`training/loop.py::evaluate`) and the no-learning
baseline (`evaluation/baseline.py`) build their report here, so the metric
names, the choice of metric per supervision level, and the rescaling back to
SpeechOcean762's raw scales are decided once and the two reports stay
comparable key for key.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from echolingo_speech.evaluation.metrics import (
    average_precision,
    error_detection_metrics,
    mean_absolute_error,
    pearson_correlation,
    score_band_error,
    spearman_correlation,
)
from echolingo_speech.training.labels import (
    PHONE_SCALE,
    SENTENCE_SCALE,
    SENTENCE_TARGET_KEYS,
    WORD_SCALE,
)


def _empty_sentence_lists() -> dict[str, list[float]]:
    return {key: [] for key in SENTENCE_TARGET_KEYS}


@dataclass
class ScorePairs:
    """Predictions and targets on the [0, 1]-normalized scale that
    `training/labels.py` produces, already filtered to mask-valid examples.
    """

    sentence_preds: dict[str, list[float]] = field(default_factory=_empty_sentence_lists)
    sentence_targets: dict[str, list[float]] = field(default_factory=_empty_sentence_lists)
    word_accuracy_preds: list[float] = field(default_factory=list)
    word_accuracy_targets: list[float] = field(default_factory=list)
    phone_accuracy_preds: list[float] = field(default_factory=list)
    phone_accuracy_targets: list[float] = field(default_factory=list)


def _to_raw_scale(values: list[float], scale: float) -> list[float]:
    return [value * scale for value in values]


def assemble_metrics(
    pairs: ScorePairs,
    *,
    score_band_width: float,
    error_detection_threshold: float,
    include_correlation: bool = True,
    prediction_thresholds: dict[str, float] | None = None,
) -> dict:
    """`include_correlation=False` is for constant predictors, which have no
    defined Pearson/Spearman agreement. `prediction_thresholds` maps "word" /
    "phone" to a validation-chosen prediction cut; a level without one splits
    predictions at `error_detection_threshold`, like its labels.
    """
    prediction_thresholds = prediction_thresholds or {}
    metrics: dict = {}

    for key in SENTENCE_TARGET_KEYS:
        preds = pairs.sentence_preds[key]
        targets = pairs.sentence_targets[key]
        preds_raw = _to_raw_scale(preds, SENTENCE_SCALE)
        targets_raw = _to_raw_scale(targets, SENTENCE_SCALE)
        if include_correlation:
            metrics[f"sentence_{key}_pearson"] = pearson_correlation(preds, targets)
            metrics[f"sentence_{key}_spearman"] = spearman_correlation(preds, targets)
        metrics[f"sentence_{key}_mae"] = mean_absolute_error(preds_raw, targets_raw)
        metrics[f"sentence_{key}_score_band_error"] = score_band_error(
            preds_raw, targets_raw, score_band_width
        )

    for level, preds, targets, scale in (
        ("word", pairs.word_accuracy_preds, pairs.word_accuracy_targets, WORD_SCALE),
        ("phone", pairs.phone_accuracy_preds, pairs.phone_accuracy_targets, PHONE_SCALE),
    ):
        if not preds:
            continue
        if include_correlation:
            metrics[f"{level}_accuracy_pearson"] = pearson_correlation(preds, targets)
        metrics[f"{level}_accuracy_mae"] = mean_absolute_error(
            _to_raw_scale(preds, scale), _to_raw_scale(targets, scale)
        )
        cut = prediction_thresholds.get(level, error_detection_threshold)
        metrics[f"{level}_error_detection"] = {
            **error_detection_metrics(preds, targets, error_detection_threshold, cut),
            "prediction_threshold": cut,
        }
        metrics[f"{level}_error_detection_average_precision"] = average_precision(
            preds, targets, error_detection_threshold
        )

    return metrics
