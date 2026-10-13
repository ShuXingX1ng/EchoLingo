"""No-learning constant-mean baseline for the A0 acceptance comparison
(roadmap SS7.2): predicts each held-out example's training-partition mean
label, establishing the floor the trained model's sentence/word/phone
predictions must beat. Operates on the same `ScoringExample`s the real model
trains against (`training/dataset.py`), so results are directly comparable to
`training/loop.py::evaluate`'s MAE / score-band-error / error-detection
metrics -- Pearson/Spearman are omitted since a constant predictor has no
defined correlation.

CLI: `python -m echolingo_speech.evaluation.baseline
  --config ... --training-config ... --manifest ...`
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from echolingo_speech.config import load_config
from echolingo_speech.evaluation.report import ScorePairs, assemble_metrics
from echolingo_speech.training.config import load_training_config
from echolingo_speech.training.dataset import ScoringExample, SpeechOceanScoringDataset
from echolingo_speech.training.labels import SENTENCE_TARGET_KEYS


def _sentence_targets(examples: list[ScoringExample], key_index: int) -> list[float]:
    return [example.sentence_targets[key_index].item() for example in examples]


def _word_accuracy_targets(examples: list[ScoringExample]) -> list[float]:
    return [
        word.accuracy
        for example in examples
        if example.word_alignment_valid
        for word in example.word_examples
    ]


def _phone_accuracy_targets(examples: list[ScoringExample]) -> list[float]:
    return [phone.accuracy for example in examples for phone in example.phone_examples]


def _constant_mean(train_targets: list[float], count: int) -> list[float]:
    mean = float(np.mean(train_targets)) if train_targets else 0.0
    return [mean] * count


def constant_mean_baseline_metrics(
    train_examples: list[ScoringExample],
    test_examples: list[ScoringExample],
    *,
    score_band_width: float,
    error_detection_threshold: float,
) -> dict:
    """For each supervision level, predict the training partition's mean label
    for every test example and score it with the same metrics `evaluate` uses.
    """
    pairs = ScorePairs()

    for index, key in enumerate(SENTENCE_TARGET_KEYS):
        test_targets = _sentence_targets(test_examples, index)
        pairs.sentence_targets[key] = test_targets
        pairs.sentence_preds[key] = _constant_mean(
            _sentence_targets(train_examples, index), len(test_targets)
        )

    pairs.word_accuracy_targets = _word_accuracy_targets(test_examples)
    pairs.word_accuracy_preds = _constant_mean(
        _word_accuracy_targets(train_examples), len(pairs.word_accuracy_targets)
    )

    pairs.phone_accuracy_targets = _phone_accuracy_targets(test_examples)
    pairs.phone_accuracy_preds = _constant_mean(
        _phone_accuracy_targets(train_examples), len(pairs.phone_accuracy_targets)
    )

    return assemble_metrics(
        pairs,
        score_band_width=score_band_width,
        error_detection_threshold=error_detection_threshold,
        include_correlation=False,
    )


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.evaluation.baseline")
    parser.add_argument("--config", type=Path, required=True, help="path to speech.yaml")
    parser.add_argument("--training-config", type=Path, required=True, help="path to a0.yaml")
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args(argv)

    speech_config = load_config(args.config)
    training_config = load_training_config(args.training_config)
    processed_root = speech_config.data_root / "processed" / "speechocean762"

    train_dataset = SpeechOceanScoringDataset(args.manifest, processed_root, partition="train")
    test_dataset = SpeechOceanScoringDataset(args.manifest, processed_root, partition="test")

    metrics = constant_mean_baseline_metrics(
        train_dataset.examples,
        test_dataset.examples,
        score_band_width=training_config.score_band_width,
        error_detection_threshold=training_config.error_detection_threshold,
    )
    for key, value in metrics.items():
        print(f"{key} = {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
