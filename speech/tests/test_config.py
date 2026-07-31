"""Layer 2 smoke test: SpeechConfig validation, including deliberately invalid configs."""

from pathlib import Path

import pytest
import yaml

from echolingo_speech.config import load_config

REPO_ROOT = Path(__file__).resolve().parents[1]


def _write_config(tmp_path: Path, *, data_root: Path, artifact_root: Path, revision: str) -> Path:
    encoder_config = tmp_path / "encoder.yaml"
    encoder_config.write_text(
        yaml.safe_dump({"model_id": "facebook/wav2vec2-base-960h", "revision": revision})
    )

    speech_config = tmp_path / "speech.yaml"
    speech_config.write_text(
        yaml.safe_dump(
            {
                "data_root": str(data_root),
                "artifact_root": str(artifact_root),
                "mlflow_tracking_uri": f"file://{artifact_root}/mlruns",
                "worker_host": "localhost",
                "worker_port": 8100,
                "encoder_config_path": "encoder.yaml",
            }
        )
    )
    return speech_config


def _make_roots(tmp_path: Path) -> tuple[Path, Path]:
    data_root = tmp_path / "data"
    artifact_root = tmp_path / "artifacts"
    data_root.mkdir()
    artifact_root.mkdir()
    return data_root, artifact_root


def test_example_config_is_valid_when_paths_exist(tmp_path):
    data_root, artifact_root = _make_roots(tmp_path)
    config_path = _write_config(
        tmp_path,
        data_root=data_root,
        artifact_root=artifact_root,
        revision="22aad52d435eb6dbaf354bdad9b0da84ce7d6156",
    )

    config = load_config(config_path)

    assert config.data_root == data_root
    assert config.artifact_root == artifact_root
    assert config.encoder.model_id == "facebook/wav2vec2-base-960h"


def test_missing_data_root_is_rejected(tmp_path):
    _, artifact_root = _make_roots(tmp_path)
    config_path = _write_config(
        tmp_path,
        data_root=tmp_path / "does-not-exist",
        artifact_root=artifact_root,
        revision="22aad52d435eb6dbaf354bdad9b0da84ce7d6156",
    )

    with pytest.raises(Exception):
        load_config(config_path)


def test_non_commit_revision_is_rejected(tmp_path):
    data_root, artifact_root = _make_roots(tmp_path)
    config_path = _write_config(
        tmp_path,
        data_root=data_root,
        artifact_root=artifact_root,
        revision="main",
    )

    with pytest.raises(Exception):
        load_config(config_path)


def test_shipped_example_config_is_structurally_valid():
    example = REPO_ROOT / "configs" / "speech.example.yaml"
    raw = yaml.safe_load(example.read_text(encoding="utf-8"))
    assert "data_root" in raw
    assert "artifact_root" in raw
    assert "encoder_config_path" in raw

    encoder_path = example.parent / raw["encoder_config_path"]
    encoder_raw = yaml.safe_load(encoder_path.read_text(encoding="utf-8"))
    assert len(encoder_raw["revision"]) == 40
