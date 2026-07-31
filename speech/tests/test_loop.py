"""Pure train/eval loop tests: does an optimizer step actually reduce loss,
and does `evaluate` report every expected metric -- against a tiny synthetic
in-memory dataset (no real data, no GPU, no MLflow)."""

from __future__ import annotations

import torch
from torch.utils.data import DataLoader, Dataset

from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.dataset import PhoneExample, ScoringExample, WordExample, collate_fn
from echolingo_speech.training.loop import TrainingConfig, evaluate, train_one_epoch


class _ListDataset(Dataset):
    def __init__(self, examples: list[ScoringExample]) -> None:
        self.examples = examples

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, index: int) -> ScoringExample:
        return self.examples[index]


def _make_example(sample_id: str, accuracy: float) -> ScoringExample:
    hidden_states = torch.randn(10, 768)
    sentence_targets = torch.tensor([accuracy, 1.0 - accuracy, accuracy, 1.0])
    acoustic_features = torch.randn(9)
    word_examples = [WordExample(0, 3, accuracy, 1.0), WordExample(3, 6, 1.0 - accuracy, 0.0)]
    phone_examples = [PhoneExample(0, 1, accuracy), PhoneExample(1, 2, 1.0 - accuracy)]
    return ScoringExample(
        sample_id=sample_id,
        hidden_states=hidden_states,
        sentence_targets=sentence_targets,
        acoustic_features=acoustic_features,
        word_examples=word_examples,
        phone_examples=phone_examples,
        word_alignment_valid=True,
    )


def _make_loader() -> DataLoader:
    examples = [
        _make_example(f"S{i}", accuracy) for i, accuracy in enumerate([0.2, 0.5, 0.8, 1.0])
    ]
    return DataLoader(_ListDataset(examples), batch_size=2, collate_fn=collate_fn)


def test_train_one_epoch_reduces_loss_over_several_epochs():
    torch.manual_seed(0)
    loader = _make_loader()
    model = SpeechEvaluatorA0()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-2)

    first_loss = train_one_epoch(model, loader, optimizer, "cpu")
    last_loss = first_loss
    for _ in range(20):
        last_loss = train_one_epoch(model, loader, optimizer, "cpu")

    assert last_loss < first_loss


def test_evaluate_returns_every_expected_metric_key():
    torch.manual_seed(0)
    loader = _make_loader()
    model = SpeechEvaluatorA0()
    training_config = TrainingConfig()

    metrics = evaluate(model, loader, "cpu", training_config)

    assert "loss" in metrics
    for key in ("accuracy", "fluency", "prosodic", "completeness"):
        assert f"sentence_{key}_pearson" in metrics
        assert f"sentence_{key}_spearman" in metrics
        assert f"sentence_{key}_mae" in metrics
        assert f"sentence_{key}_score_band_error" in metrics

    assert "word_accuracy_pearson" in metrics
    assert "word_accuracy_mae" in metrics
    assert "word_error_detection" in metrics
    assert set(metrics["word_error_detection"]) == {"precision", "recall", "f1", "macro_f1"}

    assert "phone_accuracy_pearson" in metrics
    assert "phone_accuracy_mae" in metrics
    assert "phone_error_detection" in metrics
