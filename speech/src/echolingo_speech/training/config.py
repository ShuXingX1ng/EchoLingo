"""A0 training hyperparameters (`configs/training/a0.yaml`).

Kept apart from `training/loop.py` so that readers of the thresholds alone
(e.g. `evaluation/baseline.py`) do not have to import the training loop.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel


class TrainingConfig(BaseModel):
    seed: int = 42
    batch_size: int = 32
    learning_rate: float = 1e-3
    weight_decay: float = 1e-2
    dropout: float = 0.3
    max_epochs: int = 150
    early_stopping_patience: int = 15
    lr_scheduler_patience: int = 7
    lr_scheduler_factor: float = 0.5
    # Within the word loss: accuracy Huber vs stress BCE (A0: equal 0.5 / 0.5).
    word_accuracy_weight: float = 0.5
    word_stress_weight: float = 0.5
    # Standardize the explicit acoustic features with training-partition stats.
    normalize_acoustic_features: bool = False
    # Give word/phone heads the canonical (expected) phone identities.
    use_canonical_phones: bool = False
    # Wav2Vec2 layers to mix (needs `features.cache extract-layers`); None
    # means the last layer from the original cache.
    hidden_state_layers: list[int] | None = None
    # M3 A0-Rater: train on the five experts' mean (`scores["raters"]`) instead
    # of the official aggregate. Validation and test always keep the official
    # labels, so early stopping, thresholds and metrics stay comparable.
    rater_mean_targets: bool = False
    # Auxiliary heads that predict the experts' spread (std) at every level,
    # weighted by `rater_spread_weight` in the total loss. Internal only.
    predict_rater_spread: bool = False
    rater_spread_weight: float = 1.0
    # M3 A0-Aug feature masks on the cached hidden states, training only (the
    # model ignores them in eval mode). Each frame starts a time mask with
    # probability `time_mask_prob`, 1..`time_mask_max_width` frames wide;
    # masked frames are left out of pooling, but never all of a word's or
    # phone's frames. `channel_mask_ratio` of the channels are zeroed per
    # utterance.
    time_mask_prob: float = 0.0
    time_mask_max_width: int = 2
    channel_mask_ratio: float = 0.0
    # M3 A0-Aug augmented audio: feature-cache variants of the training
    # partition (`features/augment.py`, e.g. ["train-aug-1", "train-aug-2"]).
    # Each training item is one of them with probability `augmentation_prob`,
    # else the clean audio. Validation and test stay clean.
    augmentation_variants: list[str] | None = None
    augmentation_prob: float = 0.5
    error_detection_threshold: float = 0.6
    score_band_width: float = 1.0
    mlflow_experiment_name: str = "speech-evaluator-a0"


def load_training_config(path: Path) -> TrainingConfig:
    raw = yaml.safe_load(path.read_text())
    return TrainingConfig(**raw)
