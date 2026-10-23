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
    error_detection_threshold: float = 0.6
    score_band_width: float = 1.0
    mlflow_experiment_name: str = "speech-evaluator-a0"


def load_training_config(path: Path) -> TrainingConfig:
    raw = yaml.safe_load(path.read_text())
    return TrainingConfig(**raw)
