"""A0 training loop: AdamW + ReduceLROnPlateau + early stopping over the
frozen-encoder multi-task scorer, with MLflow tracking (roadmap SS9.4) and a
CLI entrypoint.

`train_one_epoch` / `evaluate` are the two pure, MLflow-free functions worth
unit testing directly; `run_training` and `_cli` are the orchestration layer
exercised by the real WSL2 smoke/full runs (task #9/#10), not by fast unit
tests, since they touch the filesystem, MLflow, and (optionally) a GPU.
"""

from __future__ import annotations

import argparse
import os
import random
import subprocess
from pathlib import Path

import mlflow
import numpy as np
import torch
import yaml
from pydantic import BaseModel
from torch.utils.data import DataLoader

from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import read_jsonl
from echolingo_speech.evaluation.metrics import (
    error_detection_metrics,
    mean_absolute_error,
    pearson_correlation,
    score_band_error,
    spearman_correlation,
)
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.dataset import SpeechOceanScoringDataset, collate_fn
from echolingo_speech.training.labels import SENTENCE_TARGET_KEYS
from echolingo_speech.training.losses import compute_total_loss

# ADR-0013 SS9.4 / roadmap SS9.4 intentionally use a local file-based mlruns
# store; MLflow >=3 disables that backend unless explicitly opted into (see
# tests/test_smoke.py::test_mlflow_local_tracking_round_trip), so this must be
# set before any mlflow tracking call, not left to the caller's shell.
os.environ.setdefault("MLFLOW_ALLOW_FILE_STORE", "true")


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
    error_detection_threshold: float = 0.6
    score_band_width: float = 1.0
    mlflow_experiment_name: str = "speech-evaluator-a0"


def load_training_config(path: Path) -> TrainingConfig:
    raw = yaml.safe_load(path.read_text())
    return TrainingConfig(**raw)


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _move_batch_to_device(batch: dict, device: str) -> dict:
    moved = dict(batch)
    for key in ("hidden_states", "frame_mask", "sentence_targets", "acoustic_features"):
        moved[key] = batch[key].to(device)
    return moved


def train_one_epoch(
    model: SpeechEvaluatorA0, loader: DataLoader, optimizer: torch.optim.Optimizer, device: str
) -> float:
    model.train()
    total_loss = 0.0
    num_batches = 0
    for batch in loader:
        batch = _move_batch_to_device(batch, device)
        optimizer.zero_grad()
        predictions = model(batch)
        losses = compute_total_loss(predictions, batch)
        losses["total"].backward()
        optimizer.step()
        total_loss += losses["total"].item()
        num_batches += 1
    return total_loss / max(1, num_batches)


@torch.no_grad()
def evaluate(
    model: SpeechEvaluatorA0, loader: DataLoader, device: str, training_config: TrainingConfig
) -> dict:
    """Runs one full pass without gradients, accumulating both the training
    loss (for early stopping / LR scheduling) and every roadmap SS7.1 metric
    (for us to read and reason about) -- no single metric here decides
    anything on its own.
    """
    model.eval()
    total_loss = 0.0
    num_batches = 0

    sentence_preds: dict[str, list[float]] = {key: [] for key in SENTENCE_TARGET_KEYS}
    sentence_targets: dict[str, list[float]] = {key: [] for key in SENTENCE_TARGET_KEYS}
    word_accuracy_preds: list[float] = []
    word_accuracy_targets: list[float] = []
    phone_accuracy_preds: list[float] = []
    phone_accuracy_targets: list[float] = []

    for batch in loader:
        batch = _move_batch_to_device(batch, device)
        predictions = model(batch)
        losses = compute_total_loss(predictions, batch)
        total_loss += losses["total"].item()
        num_batches += 1

        scores = predictions["sentence_scores"].cpu()
        targets = batch["sentence_targets"].cpu()
        for i, key in enumerate(SENTENCE_TARGET_KEYS):
            sentence_preds[key].extend(scores[:, i].tolist())
            sentence_targets[key].extend(targets[:, i].tolist())

        for pred_tensor, examples, is_valid in zip(
            predictions["word_accuracy"], batch["word_examples"], batch["word_alignment_valid"]
        ):
            if not is_valid or not examples:
                continue
            word_accuracy_preds.extend(pred_tensor.cpu().tolist())
            word_accuracy_targets.extend(example.accuracy for example in examples)

        for pred_tensor, examples in zip(predictions["phone_accuracy"], batch["phone_examples"]):
            if not examples:
                continue
            phone_accuracy_preds.extend(pred_tensor.cpu().tolist())
            phone_accuracy_targets.extend(example.accuracy for example in examples)

    metrics: dict = {"loss": total_loss / max(1, num_batches)}
    for key in SENTENCE_TARGET_KEYS:
        preds_original_scale = [value * 10 for value in sentence_preds[key]]
        targets_original_scale = [value * 10 for value in sentence_targets[key]]
        metrics[f"sentence_{key}_pearson"] = pearson_correlation(
            sentence_preds[key], sentence_targets[key]
        )
        metrics[f"sentence_{key}_spearman"] = spearman_correlation(
            sentence_preds[key], sentence_targets[key]
        )
        metrics[f"sentence_{key}_mae"] = mean_absolute_error(
            preds_original_scale, targets_original_scale
        )
        metrics[f"sentence_{key}_score_band_error"] = score_band_error(
            preds_original_scale, targets_original_scale, training_config.score_band_width
        )

    if word_accuracy_preds:
        metrics["word_accuracy_pearson"] = pearson_correlation(
            word_accuracy_preds, word_accuracy_targets
        )
        metrics["word_accuracy_mae"] = mean_absolute_error(
            [value * 10 for value in word_accuracy_preds],
            [value * 10 for value in word_accuracy_targets],
        )
        metrics["word_error_detection"] = error_detection_metrics(
            word_accuracy_preds, word_accuracy_targets, training_config.error_detection_threshold
        )

    if phone_accuracy_preds:
        metrics["phone_accuracy_pearson"] = pearson_correlation(
            phone_accuracy_preds, phone_accuracy_targets
        )
        metrics["phone_accuracy_mae"] = mean_absolute_error(
            [value * 2 for value in phone_accuracy_preds],
            [value * 2 for value in phone_accuracy_targets],
        )
        metrics["phone_error_detection"] = error_detection_metrics(
            phone_accuracy_preds, phone_accuracy_targets, training_config.error_detection_threshold
        )

    return metrics


def _flatten_metrics(metrics: dict) -> dict[str, float]:
    flat: dict[str, float] = {}
    for key, value in metrics.items():
        if isinstance(value, dict):
            for subkey, subvalue in value.items():
                flat[f"{key}_{subkey}"] = subvalue
        else:
            flat[key] = value
    return flat


def run_training(
    manifest_path: Path,
    processed_root: Path,
    training_config: TrainingConfig,
    seed: int,
    *,
    device: str | None = None,
    max_epochs: int | None = None,
    evaluate_test: bool = False,
) -> tuple[SpeechEvaluatorA0, dict]:
    """Assumes an MLflow run is already active (started by `_cli`) and logs
    per-epoch metrics into it; callers that just want the pure training logic
    without MLflow side effects should call `train_one_epoch`/`evaluate`
    directly instead.
    """
    _set_seed(seed)
    resolved_device = device or ("cuda" if torch.cuda.is_available() else "cpu")

    train_dataset = SpeechOceanScoringDataset(manifest_path, processed_root, partition="train")
    val_dataset = SpeechOceanScoringDataset(manifest_path, processed_root, partition="validation")
    train_loader = DataLoader(
        train_dataset, batch_size=training_config.batch_size, shuffle=True, collate_fn=collate_fn
    )
    val_loader = DataLoader(
        val_dataset, batch_size=training_config.batch_size, shuffle=False, collate_fn=collate_fn
    )

    model = SpeechEvaluatorA0(dropout=training_config.dropout).to(resolved_device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=training_config.learning_rate,
        weight_decay=training_config.weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer,
        mode="min",
        factor=training_config.lr_scheduler_factor,
        patience=training_config.lr_scheduler_patience,
    )

    best_val_loss = float("inf")
    best_state: dict | None = None
    epochs_without_improvement = 0
    history: list[dict] = []

    total_epochs = max_epochs or training_config.max_epochs
    for epoch in range(1, total_epochs + 1):
        train_loss = train_one_epoch(model, train_loader, optimizer, resolved_device)
        val_metrics = evaluate(model, val_loader, resolved_device, training_config)
        scheduler.step(val_metrics["loss"])

        history.append({"epoch": epoch, "train_loss": train_loss, **val_metrics})
        mlflow.log_metrics({"train_loss": train_loss, **_flatten_metrics(val_metrics)}, step=epoch)
        print(
            f"epoch {epoch:03d} "
            f"train_loss={train_loss:.4f} val_loss={val_metrics['loss']:.4f} "
            f"acc_pearson={val_metrics['sentence_accuracy_pearson']:.3f} "
            f"fluency_pearson={val_metrics['sentence_fluency_pearson']:.3f}",
            flush=True,
        )

        if val_metrics["loss"] < best_val_loss - 1e-6:
            best_val_loss = val_metrics["loss"]
            best_state = {
                key: value.detach().cpu().clone() for key, value in model.state_dict().items()
            }
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= training_config.early_stopping_patience:
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    result: dict = {"history": history, "best_val_loss": best_val_loss}

    if evaluate_test:
        test_dataset = SpeechOceanScoringDataset(manifest_path, processed_root, partition="test")
        test_loader = DataLoader(
            test_dataset,
            batch_size=training_config.batch_size,
            shuffle=False,
            collate_fn=collate_fn,
        )
        result["test_metrics"] = evaluate(model, test_loader, resolved_device, training_config)

    return model, result


def _git_commit_sha(repo_root: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_root, capture_output=True, text=True, check=True
    )
    return result.stdout.strip()


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.training.loop")
    subparsers = parser.add_subparsers(dest="command", required=True)

    train_parser = subparsers.add_parser("train", help="Train the A0 scorer")
    train_parser.add_argument("--config", type=Path, required=True, help="path to speech.yaml")
    train_parser.add_argument(
        "--training-config", type=Path, required=True, help="path to a0.yaml"
    )
    train_parser.add_argument("--manifest", type=Path, required=True)
    train_parser.add_argument("--seed", type=int, default=None)
    train_parser.add_argument("--max-epochs", type=int, default=None)
    train_parser.add_argument("--evaluate-test", action="store_true")

    args = parser.parse_args(argv)
    if args.command != "train":
        return 1

    speech_config = load_config(args.config)
    training_config = load_training_config(args.training_config)
    seed = args.seed if args.seed is not None else training_config.seed
    processed_root = speech_config.data_root / "processed" / "speechocean762"

    repo_root = Path(__file__).resolve().parents[4]
    try:
        git_commit = _git_commit_sha(repo_root)
    except Exception:  # noqa: BLE001 - reproducibility metadata, not fatal
        git_commit = "unknown"

    manifest_records = read_jsonl(args.manifest)
    dataset_version = manifest_records[0].dataset_version if manifest_records else "unknown"

    mlflow.set_tracking_uri(speech_config.mlflow_tracking_uri)
    mlflow.set_experiment(training_config.mlflow_experiment_name)

    with mlflow.start_run(run_name=f"a0-seed{seed}"):
        mlflow.log_params(
            {
                "seed": seed,
                "batch_size": training_config.batch_size,
                "learning_rate": training_config.learning_rate,
                "weight_decay": training_config.weight_decay,
                "dropout": training_config.dropout,
                "max_epochs": args.max_epochs or training_config.max_epochs,
                "early_stopping_patience": training_config.early_stopping_patience,
                "manifest_path": str(args.manifest),
                "dataset_version": dataset_version,
                "encoder_model_id": speech_config.encoder.model_id,
                "encoder_revision": speech_config.encoder.revision,
                "git_commit": git_commit,
                "device": "cuda" if torch.cuda.is_available() else "cpu",
            }
        )

        model, result = run_training(
            args.manifest,
            processed_root,
            training_config,
            seed,
            max_epochs=args.max_epochs,
            evaluate_test=args.evaluate_test,
        )

        mlflow.log_metric("best_val_loss", result["best_val_loss"])
        if "test_metrics" in result:
            mlflow.log_metrics(
                {
                    f"test_{key}": value
                    for key, value in _flatten_metrics(result["test_metrics"]).items()
                }
            )

        checkpoint_path = Path(f"a0-seed{seed}-checkpoint.pt")
        torch.save(model.state_dict(), checkpoint_path)
        mlflow.log_artifact(str(checkpoint_path))
        checkpoint_path.unlink(missing_ok=True)
        mlflow.log_artifact(str(args.training_config))

    print(f"OK: seed={seed} best_val_loss={result['best_val_loss']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
