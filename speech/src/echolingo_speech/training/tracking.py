"""Run tracking seam for an Evaluator Training Run (roadmap SS9.4).

`training/loop.py` reports params, per-epoch metrics, and artifacts through a
`RunTracker`. Production uses `MlflowTracker` against the local file-based
mlruns store; tests use `InMemoryTracker`, so the whole run can be exercised
without MLflow or a filesystem store.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol

# ADR-0013 SS9.4 / roadmap SS9.4 intentionally use a local file-based mlruns
# store; MLflow >=3 disables that backend unless explicitly opted into (see
# tests/test_smoke.py::test_mlflow_local_tracking_round_trip), so this must be
# set before any mlflow tracking call, not left to the caller's shell.
os.environ.setdefault("MLFLOW_ALLOW_FILE_STORE", "true")


class RunTracker(Protocol):
    def log_params(self, params: dict) -> None: ...

    def log_metrics(self, metrics: dict[str, float], step: int | None = None) -> None: ...

    def log_artifact(self, path: Path) -> None: ...


class InMemoryTracker:
    """Records everything it is told, for tests and for runs nobody tracks."""

    def __init__(self) -> None:
        self.params: dict = {}
        self.metrics: list[tuple[int | None, dict[str, float]]] = []
        self.artifacts: list[Path] = []

    def log_params(self, params: dict) -> None:
        self.params.update(params)

    def log_metrics(self, metrics: dict[str, float], step: int | None = None) -> None:
        self.metrics.append((step, dict(metrics)))

    def log_artifact(self, path: Path) -> None:
        self.artifacts.append(Path(path))


class MlflowTracker:
    """Logs into the currently active MLflow run (see `mlflow_run`)."""

    def log_params(self, params: dict) -> None:
        import mlflow

        mlflow.log_params(params)

    def log_metrics(self, metrics: dict[str, float], step: int | None = None) -> None:
        import mlflow

        mlflow.log_metrics(metrics, step=step)

    def log_artifact(self, path: Path) -> None:
        import mlflow

        mlflow.log_artifact(str(path))


@contextmanager
def mlflow_run(tracking_uri: str, experiment_name: str, run_name: str) -> Iterator[MlflowTracker]:
    import mlflow

    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(experiment_name)
    with mlflow.start_run(run_name=run_name):
        yield MlflowTracker()
