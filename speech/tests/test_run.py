"""End-to-end Evaluator Training Run tests: `fit` with tracking, early
stopping, checkpointing, and resume, against a tiny synthetic in-memory
dataset on CPU (no real data, no GPU, no MLflow)."""

from __future__ import annotations

import pytest
import torch
from torch.utils.data import DataLoader, Dataset

from echolingo_speech.evaluation.baseline import constant_mean_baseline_metrics
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.checkpoint import (
    BEST_CHECKPOINT_NAME,
    LAST_CHECKPOINT_NAME,
    load_model,
)
from echolingo_speech.training.config import TrainingConfig
from echolingo_speech.training.dataset import PhoneExample, ScoringExample, WordExample, collate_fn
from echolingo_speech.training.loop import (
    acoustic_feature_statistics,
    evaluate,
    fit,
    read_prediction_thresholds,
    select_prediction_thresholds,
    write_prediction_thresholds,
)
from echolingo_speech.training.tracking import InMemoryTracker

SEED = 7


class _ListDataset(Dataset):
    def __init__(self, examples: list[ScoringExample]) -> None:
        self.examples = examples

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, index: int) -> ScoringExample:
        return self.examples[index]


def _make_examples() -> list[ScoringExample]:
    generator = torch.Generator().manual_seed(0)
    examples = []
    for i, accuracy in enumerate([0.2, 0.5, 0.8, 1.0]):
        examples.append(
            ScoringExample(
                sample_id=f"S{i}",
                hidden_states=torch.randn(10, 768, generator=generator),
                sentence_targets=torch.tensor([accuracy, 1.0 - accuracy, accuracy, 1.0]),
                acoustic_features=torch.randn(9, generator=generator),
                word_examples=[
                    WordExample(0, 3, accuracy, 1.0),
                    WordExample(3, 6, 1.0 - accuracy, 0.0),
                ],
                phone_examples=[PhoneExample(0, 1, accuracy), PhoneExample(1, 2, 1.0 - accuracy)],
                word_alignment_valid=True,
            )
        )
    return examples


def _loaders() -> tuple[DataLoader, DataLoader]:
    dataset = _ListDataset(_make_examples())
    train_loader = DataLoader(dataset, batch_size=2, shuffle=True, collate_fn=collate_fn)
    val_loader = DataLoader(dataset, batch_size=2, shuffle=False, collate_fn=collate_fn)
    return train_loader, val_loader


def _config(**overrides) -> TrainingConfig:
    return TrainingConfig(**{"learning_rate": 1e-2, "max_epochs": 4, **overrides})


def _val_losses(result: dict) -> list[float]:
    return [entry["loss"] for entry in result["history"]]


def test_fit_reports_the_run_definition_and_every_epoch_to_the_tracker():
    tracker = InMemoryTracker()
    train_loader, val_loader = _loaders()

    _, result = fit(train_loader, val_loader, _config(), SEED, tracker=tracker, device="cpu")

    assert result["epochs_run"] == 4
    assert tracker.params["seed"] == SEED
    assert tracker.params["device"] == "cpu"
    assert tracker.params["learning_rate"] == 1e-2
    assert tracker.params["loss_weight_sentence"] == 0.45
    assert tracker.params["model_hidden_dim"] == 768

    epoch_steps = [step for step, _ in tracker.metrics if step is not None]
    assert epoch_steps == [1, 2, 3, 4]
    _, summary = tracker.metrics[-1]
    assert summary["best_val_loss"] == pytest.approx(result["best_val_loss"])
    assert summary["duration_seconds"] >= 0


def test_fit_stops_early_once_validation_loss_stops_improving():
    train_loader, val_loader = _loaders()
    # A zero learning rate means epoch 1 sets the best loss and nothing
    # after it can improve on that.
    config = _config(learning_rate=0.0, weight_decay=0.0, max_epochs=10, early_stopping_patience=2)

    _, result = fit(train_loader, val_loader, config, SEED, device="cpu")

    assert result["epochs_run"] == 3


def test_fit_returns_the_best_checkpoint_not_the_last(tmp_path):
    train_loader, val_loader = _loaders()
    config = _config()

    model, result = fit(
        train_loader, val_loader, config, SEED, device="cpu", checkpoint_dir=tmp_path
    )

    assert (tmp_path / LAST_CHECKPOINT_NAME).is_file()
    assert result["best_checkpoint"] == tmp_path / BEST_CHECKPOINT_NAME
    assert result["best_val_loss"] == pytest.approx(min(_val_losses(result)))

    reloaded = load_model(tmp_path / BEST_CHECKPOINT_NAME, "cpu")
    for model_under_test in (model, reloaded):
        metrics = evaluate(model_under_test, val_loader, "cpu", config)
        assert metrics["loss"] == pytest.approx(result["best_val_loss"], abs=1e-6)


def _run_one_epoch(checkpoint_dir) -> tuple[DataLoader, DataLoader]:
    train_loader, val_loader = _loaders()
    config = _config(max_epochs=1)
    fit(train_loader, val_loader, config, SEED, device="cpu", checkpoint_dir=checkpoint_dir)
    return train_loader, val_loader


def test_fit_refuses_to_overwrite_an_existing_run_unless_resuming(tmp_path):
    train_loader, val_loader = _run_one_epoch(tmp_path)

    with pytest.raises(FileExistsError):
        fit(
            train_loader,
            val_loader,
            _config(max_epochs=1),
            SEED,
            device="cpu",
            checkpoint_dir=tmp_path,
        )


def test_resumed_run_matches_an_uninterrupted_one(tmp_path):
    config = _config()

    train_loader, val_loader = _loaders()
    _, uninterrupted = fit(
        train_loader, val_loader, config, SEED, device="cpu", checkpoint_dir=tmp_path / "full"
    )

    interrupted_dir = tmp_path / "interrupted"
    train_loader, val_loader = _loaders()
    fit(
        train_loader,
        val_loader,
        config,
        SEED,
        device="cpu",
        max_epochs=2,
        checkpoint_dir=interrupted_dir,
    )
    train_loader, val_loader = _loaders()
    tracker = InMemoryTracker()
    _, resumed = fit(
        train_loader,
        val_loader,
        config,
        SEED,
        tracker=tracker,
        device="cpu",
        checkpoint_dir=interrupted_dir,
        resume=True,
    )

    assert resumed["resumed_from_epoch"] == 2
    assert tracker.params["resumed_from_epoch"] == 2
    assert [step for step, _ in tracker.metrics if step is not None] == [3, 4]
    assert _val_losses(resumed) == pytest.approx(_val_losses(uninterrupted), abs=1e-6)
    assert resumed["best_val_loss"] == pytest.approx(uninterrupted["best_val_loss"], abs=1e-6)


def test_resume_refuses_a_checkpoint_from_a_different_seed(tmp_path):
    train_loader, val_loader = _run_one_epoch(tmp_path)

    with pytest.raises(ValueError, match="seed"):
        fit(
            train_loader,
            val_loader,
            _config(),
            SEED + 1,
            device="cpu",
            checkpoint_dir=tmp_path,
            resume=True,
        )


def test_fit_logs_into_a_local_mlflow_store(tmp_path):
    import mlflow

    from echolingo_speech.training.tracking import mlflow_run

    tracking_uri = f"file://{tmp_path / 'mlruns'}"
    train_loader, val_loader = _loaders()

    with mlflow_run(tracking_uri, "test-run", "a0-test") as tracker:
        _, result = fit(
            train_loader,
            val_loader,
            _config(max_epochs=2),
            SEED,
            tracker=tracker,
            device="cpu",
            checkpoint_dir=tmp_path / "checkpoints",
        )
        tracker.log_artifact(result["best_checkpoint"])
        run_id = mlflow.active_run().info.run_id

    client = mlflow.tracking.MlflowClient(tracking_uri=tracking_uri)
    run = client.get_run(run_id)
    assert run.data.params["seed"] == str(SEED)
    assert run.data.params["loss_weight_word"] == "0.3"
    assert len(client.get_metric_history(run_id, "train_loss")) == 2
    assert run.data.metrics["best_val_loss"] == pytest.approx(result["best_val_loss"])
    assert [artifact.path for artifact in client.list_artifacts(run_id)] == [BEST_CHECKPOINT_NAME]


def test_load_model_accepts_a_weights_only_checkpoint_from_m2(tmp_path):
    original = SpeechEvaluatorA0()
    legacy_path = tmp_path / "a0-seed42-checkpoint.pt"
    torch.save(original.state_dict(), legacy_path)

    reloaded = load_model(legacy_path, "cpu")

    for key, value in original.state_dict().items():
        assert torch.equal(reloaded.state_dict()[key], value)


def test_baseline_report_uses_the_same_metric_names_as_evaluate():
    examples = _make_examples()
    _, val_loader = _loaders()
    config = _config()

    model_metrics = evaluate(SpeechEvaluatorA0(), val_loader, "cpu", config)
    baseline_metrics = constant_mean_baseline_metrics(
        examples,
        examples,
        score_band_width=config.score_band_width,
        error_detection_threshold=config.error_detection_threshold,
    )

    assert baseline_metrics
    assert set(baseline_metrics) <= set(model_metrics)


def test_resume_refuses_a_changed_training_configuration(tmp_path):
    train_loader, val_loader = _run_one_epoch(tmp_path)
    changed = _config().model_copy(update={"learning_rate": _config().learning_rate * 10})

    with pytest.raises(ValueError, match="learning_rate"):
        fit(
            train_loader,
            val_loader,
            changed,
            SEED,
            device="cpu",
            checkpoint_dir=tmp_path,
            resume=True,
        )


def test_resume_allows_training_for_more_epochs(tmp_path):
    train_loader, val_loader = _run_one_epoch(tmp_path)
    longer = _config().model_copy(update={"max_epochs": _config().max_epochs + 1})

    _, summary = fit(
        train_loader, val_loader, longer, SEED, device="cpu", checkpoint_dir=tmp_path, resume=True
    )

    assert summary["resumed_from_epoch"] == 1


def test_selected_prediction_thresholds_round_trip_and_feed_evaluate(tmp_path):
    torch.manual_seed(SEED)
    _, val_loader = _loaders()
    config = _config()
    model = SpeechEvaluatorA0()

    thresholds = select_prediction_thresholds(model, val_loader, "cpu", config)
    assert set(thresholds) == {"word", "phone"}

    path = write_prediction_thresholds(tmp_path / "run", thresholds)
    assert read_prediction_thresholds(path.parent) == thresholds
    assert read_prediction_thresholds(tmp_path / "missing") is None

    metrics = evaluate(model, val_loader, "cpu", config, prediction_thresholds=thresholds)
    assert metrics["word_error_detection"]["prediction_threshold"] == thresholds["word"]
    assert metrics["phone_error_detection"]["prediction_threshold"] == thresholds["phone"]
    assert "word_error_detection_average_precision" in metrics
    assert "phone_error_detection_average_precision" in metrics


def test_fit_stores_training_acoustic_statistics_in_the_checkpoint(tmp_path):
    train_loader, val_loader = _loaders()
    config = _config(max_epochs=1, normalize_acoustic_features=True)

    fit(train_loader, val_loader, config, SEED, device="cpu", checkpoint_dir=tmp_path)
    reloaded = load_model(tmp_path / BEST_CHECKPOINT_NAME, "cpu")

    mean, std = acoustic_feature_statistics(train_loader)
    assert reloaded.config["normalize_acoustic_features"] is True
    assert torch.allclose(reloaded.acoustic_mean, mean)
    assert torch.allclose(reloaded.acoustic_std, std)
