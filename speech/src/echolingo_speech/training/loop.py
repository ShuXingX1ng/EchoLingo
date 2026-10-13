"""A0 Evaluator Training Run: AdamW + ReduceLROnPlateau + early stopping over
the frozen-encoder multi-task scorer, with run tracking (roadmap SS9.4),
resumable checkpoints, and a CLI entrypoint.

`fit` is the run itself: it takes data loaders and a run definition and
returns the best model plus a result summary. It reports through a
`RunTracker` and checkpoints through `training/checkpoint.py`, so it can be
exercised end to end on CPU with an in-memory tracker and a temp directory.
`run_training` and `_cli` only add what needs the real filesystem layout:
building datasets from a manifest and opening the MLflow run.

CLI: `python -m echolingo_speech.training.loop {train,evaluate}`
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import subprocess
import time
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import read_jsonl
from echolingo_speech.evaluation.report import ScorePairs, assemble_metrics
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.checkpoint import (
    BEST_CHECKPOINT_NAME,
    LAST_CHECKPOINT_NAME,
    TrainingState,
    load_model,
    restore_training,
    save_training_checkpoint,
)
from echolingo_speech.training.config import TrainingConfig, load_training_config
from echolingo_speech.training.dataset import SpeechOceanScoringDataset, collate_fn
from echolingo_speech.training.labels import SENTENCE_TARGET_KEYS
from echolingo_speech.training.losses import (
    PHONE_WEIGHT,
    SENTENCE_WEIGHT,
    WORD_WEIGHT,
    compute_total_loss,
)
from echolingo_speech.training.tracking import InMemoryTracker, RunTracker, mlflow_run

PARTITIONS = ("train", "validation", "test")


def resolve_device(requested: str | None = None) -> str:
    return requested or ("cuda" if torch.cuda.is_available() else "cpu")


def _gpu_name(device: str) -> str:
    if not device.startswith("cuda"):
        return "none"
    return torch.cuda.get_device_name(torch.device(device))


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
    pairs = ScorePairs()

    for batch in loader:
        batch = _move_batch_to_device(batch, device)
        predictions = model(batch)
        losses = compute_total_loss(predictions, batch)
        total_loss += losses["total"].item()
        num_batches += 1

        scores = predictions["sentence_scores"].cpu()
        targets = batch["sentence_targets"].cpu()
        for i, key in enumerate(SENTENCE_TARGET_KEYS):
            pairs.sentence_preds[key].extend(scores[:, i].tolist())
            pairs.sentence_targets[key].extend(targets[:, i].tolist())

        for pred_tensor, examples, is_valid in zip(
            predictions["word_accuracy"], batch["word_examples"], batch["word_alignment_valid"]
        ):
            if not is_valid or not examples:
                continue
            pairs.word_accuracy_preds.extend(pred_tensor.cpu().tolist())
            pairs.word_accuracy_targets.extend(example.accuracy for example in examples)

        for pred_tensor, examples in zip(predictions["phone_accuracy"], batch["phone_examples"]):
            if not examples:
                continue
            pairs.phone_accuracy_preds.extend(pred_tensor.cpu().tolist())
            pairs.phone_accuracy_targets.extend(example.accuracy for example in examples)

    metrics: dict = {"loss": total_loss / max(1, num_batches)}
    metrics.update(
        assemble_metrics(
            pairs,
            score_band_width=training_config.score_band_width,
            error_detection_threshold=training_config.error_detection_threshold,
        )
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


def fit(
    train_loader: DataLoader,
    val_loader: DataLoader,
    training_config: TrainingConfig,
    seed: int,
    *,
    tracker: RunTracker | None = None,
    device: str | None = None,
    max_epochs: int | None = None,
    checkpoint_dir: Path | None = None,
    resume: bool = False,
) -> tuple[SpeechEvaluatorA0, dict]:
    """Train until `max_epochs` or early stopping and return the model at its
    best validation loss.

    With a `checkpoint_dir`, the run writes `last.pt` and `best.pt` after
    every epoch. Calling again with the same directory and `resume=True`
    continues from `last.pt`; without `resume` an existing run is refused
    rather than overwritten. Without a `checkpoint_dir` nothing is written
    and the best weights are only held in memory.
    """
    tracker = tracker if tracker is not None else InMemoryTracker()
    resolved_device = resolve_device(device)
    total_epochs = max_epochs or training_config.max_epochs

    _set_seed(seed)
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

    last_path = checkpoint_dir / LAST_CHECKPOINT_NAME if checkpoint_dir else None
    best_path = checkpoint_dir / BEST_CHECKPOINT_NAME if checkpoint_dir else None
    state = TrainingState()
    if last_path is not None and last_path.exists():
        if not resume:
            raise FileExistsError(
                f"{last_path} already exists; pass resume=True to continue that run "
                "or choose a different checkpoint_dir"
            )
        state = restore_training(
            last_path,
            model=model,
            optimizer=optimizer,
            scheduler=scheduler,
            seed=seed,
            training_config=training_config.model_dump(),
            device=resolved_device,
        )
    resumed_from_epoch = state.epoch

    tracker.log_params(
        {
            **training_config.model_dump(),
            "max_epochs": total_epochs,
            "seed": seed,
            "device": resolved_device,
            "gpu_name": _gpu_name(resolved_device),
            "loss_weight_sentence": SENTENCE_WEIGHT,
            "loss_weight_word": WORD_WEIGHT,
            "loss_weight_phone": PHONE_WEIGHT,
            **{f"model_{key}": value for key, value in model.config.items()},
            "resumed_from_epoch": resumed_from_epoch,
        }
    )

    def save(path: Path) -> None:
        save_training_checkpoint(
            path,
            model=model,
            optimizer=optimizer,
            scheduler=scheduler,
            state=state,
            seed=seed,
            training_config=training_config.model_dump(),
        )

    uses_cuda = resolved_device.startswith("cuda")
    if uses_cuda:
        torch.cuda.reset_peak_memory_stats()
    started = time.monotonic()
    best_state: dict | None = None

    for epoch in range(state.epoch + 1, total_epochs + 1):
        if state.epochs_without_improvement >= training_config.early_stopping_patience:
            break

        train_loss = train_one_epoch(model, train_loader, optimizer, resolved_device)
        val_metrics = evaluate(model, val_loader, resolved_device, training_config)
        scheduler.step(val_metrics["loss"])

        state.epoch = epoch
        state.history.append({"epoch": epoch, "train_loss": train_loss, **val_metrics})
        tracker.log_metrics({"train_loss": train_loss, **_flatten_metrics(val_metrics)}, step=epoch)
        print(
            f"epoch {epoch:03d} "
            f"train_loss={train_loss:.4f} val_loss={val_metrics['loss']:.4f} "
            f"acc_pearson={val_metrics['sentence_accuracy_pearson']:.3f} "
            f"fluency_pearson={val_metrics['sentence_fluency_pearson']:.3f}",
            flush=True,
        )

        improved = val_metrics["loss"] < state.best_val_loss - 1e-6
        if improved:
            state.best_val_loss = val_metrics["loss"]
            state.epochs_without_improvement = 0
        else:
            state.epochs_without_improvement += 1

        if last_path is not None and best_path is not None:
            if improved:
                save(best_path)
            save(last_path)
        elif improved:
            best_state = {
                key: value.detach().cpu().clone() for key, value in model.state_dict().items()
            }

    if best_path is not None and best_path.exists():
        model = load_model(best_path, resolved_device)
    elif best_state is not None:
        model.load_state_dict(best_state)

    duration_seconds = time.monotonic() - started
    summary: dict[str, float] = {
        "best_val_loss": state.best_val_loss,
        "duration_seconds": duration_seconds,
    }
    if uses_cuda:
        summary["peak_gpu_memory_mb"] = torch.cuda.max_memory_allocated() / 2**20
    tracker.log_metrics(summary)

    result: dict = {
        "history": state.history,
        "best_val_loss": state.best_val_loss,
        "epochs_run": state.epoch,
        "resumed_from_epoch": resumed_from_epoch,
        "device": resolved_device,
        "duration_seconds": duration_seconds,
        "best_checkpoint": best_path if best_path is not None and best_path.exists() else None,
    }
    return model, result


def _partition_loader(
    manifest_path: Path, processed_root: Path, partition: str, batch_size: int, *, shuffle: bool
) -> DataLoader:
    dataset = SpeechOceanScoringDataset(manifest_path, processed_root, partition=partition)
    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle, collate_fn=collate_fn)


def run_training(
    manifest_path: Path,
    processed_root: Path,
    training_config: TrainingConfig,
    seed: int,
    *,
    tracker: RunTracker | None = None,
    device: str | None = None,
    max_epochs: int | None = None,
    evaluate_test: bool = False,
    checkpoint_dir: Path | None = None,
    resume: bool = False,
) -> tuple[SpeechEvaluatorA0, dict]:
    """`fit` over the manifest's train/validation partitions, optionally
    followed by a test-partition evaluation of the best model.
    """
    resolved_device = resolve_device(device)
    batch_size = training_config.batch_size
    train_loader = _partition_loader(
        manifest_path, processed_root, "train", batch_size, shuffle=True
    )
    val_loader = _partition_loader(
        manifest_path, processed_root, "validation", batch_size, shuffle=False
    )

    model, result = fit(
        train_loader,
        val_loader,
        training_config,
        seed,
        tracker=tracker,
        device=resolved_device,
        max_epochs=max_epochs,
        checkpoint_dir=checkpoint_dir,
        resume=resume,
    )

    if evaluate_test:
        test_loader = _partition_loader(
            manifest_path, processed_root, "test", batch_size, shuffle=False
        )
        result["test_metrics"] = evaluate(model, test_loader, resolved_device, training_config)

    return model, result


def evaluate_checkpoint(
    checkpoint_path: Path,
    manifest_path: Path,
    processed_root: Path,
    training_config: TrainingConfig,
    partition: str,
    *,
    device: str | None = None,
) -> dict:
    """Score a saved checkpoint on one manifest partition without training,
    so the sealed test partition can be evaluated once a candidate is final
    (roadmap SS18.4) rather than as a side effect of a training run.
    """
    resolved_device = resolve_device(device)
    model = load_model(checkpoint_path, resolved_device)
    loader = _partition_loader(
        manifest_path, processed_root, partition, training_config.batch_size, shuffle=False
    )
    return evaluate(model, loader, resolved_device, training_config)


def _git_commit_sha(repo_root: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_root, capture_output=True, text=True, check=True
    )
    return result.stdout.strip()


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cli_train(args: argparse.Namespace) -> int:
    speech_config = load_config(args.config)
    training_config = load_training_config(args.training_config)
    seed = args.seed if args.seed is not None else training_config.seed
    processed_root = speech_config.data_root / "processed" / "speechocean762"
    run_name = args.run_name or f"a0-seed{seed}"
    checkpoint_dir = speech_config.artifact_root / "checkpoints" / run_name

    if (checkpoint_dir / LAST_CHECKPOINT_NAME).exists() and not args.resume:
        print(
            f"ERROR: {checkpoint_dir} already holds a run. Pass --resume to continue it, "
            "or --run-name to start a separate one."
        )
        return 1

    repo_root = Path(__file__).resolve().parents[4]
    try:
        git_commit = _git_commit_sha(repo_root)
    except Exception:  # noqa: BLE001 - reproducibility metadata, not fatal
        git_commit = "unknown"

    manifest_records = read_jsonl(args.manifest)
    dataset_version = manifest_records[0].dataset_version if manifest_records else "unknown"

    with mlflow_run(
        speech_config.mlflow_tracking_uri, training_config.mlflow_experiment_name, run_name
    ) as tracker:
        tracker.log_params(
            {
                "run_name": run_name,
                "manifest_path": str(args.manifest),
                "manifest_sha256": _file_sha256(args.manifest),
                "dataset_version": dataset_version,
                "encoder_model_id": speech_config.encoder.model_id,
                "encoder_revision": speech_config.encoder.revision,
                "git_commit": git_commit,
            }
        )

        _, result = run_training(
            args.manifest,
            processed_root,
            training_config,
            seed,
            tracker=tracker,
            device=args.device,
            max_epochs=args.max_epochs,
            evaluate_test=args.evaluate_test,
            checkpoint_dir=checkpoint_dir,
            resume=args.resume,
        )

        if "test_metrics" in result:
            tracker.log_metrics(
                {
                    f"test_{key}": value
                    for key, value in _flatten_metrics(result["test_metrics"]).items()
                }
            )
        if result["best_checkpoint"] is not None:
            tracker.log_artifact(result["best_checkpoint"])
        tracker.log_artifact(args.training_config)

    print(
        f"OK: seed={seed} epochs_run={result['epochs_run']} "
        f"best_val_loss={result['best_val_loss']:.4f} checkpoints={checkpoint_dir}"
    )
    return 0


def _cli_evaluate(args: argparse.Namespace) -> int:
    speech_config = load_config(args.config)
    training_config = load_training_config(args.training_config)
    processed_root = speech_config.data_root / "processed" / "speechocean762"

    metrics = evaluate_checkpoint(
        args.checkpoint,
        args.manifest,
        processed_root,
        training_config,
        args.partition,
        device=args.device,
    )
    for key, value in _flatten_metrics(metrics).items():
        print(f"{key} = {value}")
    if args.out is not None:
        args.out.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    return 0


def _add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", type=Path, required=True, help="path to speech.yaml")
    parser.add_argument("--training-config", type=Path, required=True, help="path to a0.yaml")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--device", default=None, help="e.g. cuda, cuda:0, cpu (default: auto)")


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.training.loop")
    subparsers = parser.add_subparsers(dest="command", required=True)

    train_parser = subparsers.add_parser("train", help="Train the A0 scorer")
    _add_common_arguments(train_parser)
    train_parser.add_argument("--seed", type=int, default=None)
    train_parser.add_argument("--max-epochs", type=int, default=None)
    train_parser.add_argument("--evaluate-test", action="store_true")
    train_parser.add_argument(
        "--run-name", default=None, help="names the MLflow run and checkpoint directory"
    )
    train_parser.add_argument(
        "--resume", action="store_true", help="continue from this run's last checkpoint"
    )

    evaluate_parser = subparsers.add_parser("evaluate", help="Score a saved checkpoint")
    _add_common_arguments(evaluate_parser)
    evaluate_parser.add_argument("--checkpoint", type=Path, required=True)
    evaluate_parser.add_argument("--partition", choices=PARTITIONS, default="validation")
    evaluate_parser.add_argument("--out", type=Path, default=None, help="also write metrics JSON")

    args = parser.parse_args(argv)
    if args.command == "train":
        return _cli_train(args)
    return _cli_evaluate(args)


if __name__ == "__main__":
    raise SystemExit(_cli())
