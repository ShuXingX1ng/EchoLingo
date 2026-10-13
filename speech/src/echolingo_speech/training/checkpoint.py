"""Resumable training checkpoints for an Evaluator Training Run.

A run directory holds two files, rewritten atomically after every epoch:
`last.pt` (the state needed to continue an interrupted run) and `best.pt`
(the same payload captured at the best validation loss so far). A rented GPU
instance can be released mid-run (ADR-0014); with these on the persistent
disk an interruption costs at most one epoch.

This is a training checkpoint, not an Evaluator Checkpoint Bundle: it carries
no licences, dataset manifests, or benchmark results, and the Speech
Evaluation Worker must never load it.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import torch

from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.labels import SENTENCE_TARGET_KEYS

FORMAT_VERSION = 1
LAST_CHECKPOINT_NAME = "last.pt"
BEST_CHECKPOINT_NAME = "best.pt"
# Training configuration keys that may change between starting and resuming.
RESUMABLE_CONFIG_CHANGES = frozenset({"max_epochs"})


@dataclass
class TrainingState:
    epoch: int = 0
    best_val_loss: float = float("inf")
    epochs_without_improvement: int = 0
    history: list[dict] = field(default_factory=list)


def save_training_checkpoint(
    path: Path,
    *,
    model: SpeechEvaluatorA0,
    optimizer: torch.optim.Optimizer,
    scheduler: torch.optim.lr_scheduler.ReduceLROnPlateau,
    state: TrainingState,
    seed: int,
    training_config: dict,
) -> None:
    payload = {
        "format_version": FORMAT_VERSION,
        "model_config": dict(model.config),
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict(),
        "scheduler_state": scheduler.state_dict(),
        "epoch": state.epoch,
        "best_val_loss": state.best_val_loss,
        "epochs_without_improvement": state.epochs_without_improvement,
        "history": state.history,
        "seed": seed,
        "training_config": training_config,
        "sentence_target_keys": list(SENTENCE_TARGET_KEYS),
        "torch_rng_state": torch.get_rng_state(),
        "cuda_rng_state": (
            torch.cuda.get_rng_state_all() if torch.cuda.is_available() else None
        ),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write-then-rename so an interruption mid-write never leaves a truncated
    # file where the previous good checkpoint used to be.
    tmp_path = path.with_name(path.name + ".tmp")
    torch.save(payload, tmp_path)
    os.replace(tmp_path, path)


def _load_payload(path: Path, device: str) -> dict:
    return torch.load(path, map_location=device, weights_only=True)


def load_model(path: Path, device: str) -> SpeechEvaluatorA0:
    """Rebuild the scorer from a checkpoint. Also accepts the weights-only
    `.pt` files that M2 uploaded to MLflow before checkpoints carried their
    model configuration; those are assumed to use the default dimensions.
    """
    payload = _load_payload(path, device)
    if "format_version" not in payload:
        model = SpeechEvaluatorA0()
        model.load_state_dict(payload)
        return model.to(device)

    if payload["format_version"] != FORMAT_VERSION:
        raise ValueError(
            f"unsupported checkpoint format_version {payload['format_version']!r} in {path}"
        )
    if tuple(payload["sentence_target_keys"]) != SENTENCE_TARGET_KEYS:
        raise ValueError(
            f"checkpoint {path} was trained for sentence targets "
            f"{payload['sentence_target_keys']}, but this code expects "
            f"{list(SENTENCE_TARGET_KEYS)}"
        )
    model = SpeechEvaluatorA0(**payload["model_config"])
    model.load_state_dict(payload["model_state"])
    return model.to(device)


def restore_training(
    path: Path,
    *,
    model: SpeechEvaluatorA0,
    optimizer: torch.optim.Optimizer,
    scheduler: torch.optim.lr_scheduler.ReduceLROnPlateau,
    seed: int,
    training_config: dict,
    device: str,
) -> TrainingState:
    """Load `path` into the given model/optimizer/scheduler and return where
    the run had got to. Refuses a checkpoint from a different seed, model
    shape, or training configuration, since continuing it would silently
    produce a run that is neither. `max_epochs` alone may differ: letting a
    run train for longer is the point of resuming it.
    """
    payload = _load_payload(path, device)
    if payload.get("format_version") != FORMAT_VERSION:
        raise ValueError(f"cannot resume from {path}: not a resumable training checkpoint")
    if payload["seed"] != seed:
        raise ValueError(
            f"cannot resume from {path}: it was started with seed {payload['seed']}, not {seed}"
        )
    if payload["model_config"] != dict(model.config):
        raise ValueError(f"cannot resume from {path}: model configuration differs")
    saved_config = payload["training_config"]
    changed = sorted(
        key
        for key in saved_config.keys() | training_config.keys()
        if key not in RESUMABLE_CONFIG_CHANGES
        and saved_config.get(key) != training_config.get(key)
    )
    if changed:
        details = ", ".join(
            f"{key}: {saved_config.get(key)!r} -> {training_config.get(key)!r}" for key in changed
        )
        raise ValueError(
            f"cannot resume from {path}: training configuration changed since the run "
            f"started ({details}). Restore those values or start a new run."
        )

    model.load_state_dict(payload["model_state"])
    optimizer.load_state_dict(payload["optimizer_state"])
    scheduler.load_state_dict(payload["scheduler_state"])
    torch.set_rng_state(payload["torch_rng_state"].cpu())
    if payload["cuda_rng_state"] is not None and torch.cuda.is_available():
        torch.cuda.set_rng_state_all(payload["cuda_rng_state"])

    return TrainingState(
        epoch=payload["epoch"],
        best_val_loss=payload["best_val_loss"],
        epochs_without_improvement=payload["epochs_without_improvement"],
        history=list(payload["history"]),
    )
