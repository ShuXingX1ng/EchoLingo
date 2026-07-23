"""Layer 3 smoke test: real CUDA, real encoder forward pass, real MLflow round-trip.

These tests are skipped (not failed) when a GPU or network is unavailable,
so `pytest` stays usable offline while still proving the trained-model path
end to end when the WSL2/RTX 4070 environment is present.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
ENCODER_CONFIG = REPO_ROOT / "configs" / "model" / "wav2vec2-base-960h.yaml"


def _cuda_available() -> bool:
    try:
        import torch
    except ImportError:
        return False
    return torch.cuda.is_available()


requires_gpu = pytest.mark.skipif(not _cuda_available(), reason="no CUDA GPU available")


@pytest.mark.gpu
@requires_gpu
def test_cuda_matmul_on_rtx_4070():
    import torch

    device_name = torch.cuda.get_device_name(0)
    assert "4070" in device_name

    a = torch.randn(256, 256, device="cuda")
    b = torch.randn(256, 256, device="cuda")
    result = a @ b

    assert result.shape == (256, 256)
    assert torch.isfinite(result).all()


@pytest.mark.gpu
@pytest.mark.network
@requires_gpu
def test_pinned_encoder_forward_pass(tmp_path):
    import torch
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

    encoder_config = yaml.safe_load(ENCODER_CONFIG.read_text())
    model_id = encoder_config["model_id"]
    revision = encoder_config["revision"]

    cache_dir = tmp_path / "hf-cache"
    processor = Wav2Vec2Processor.from_pretrained(model_id, revision=revision, cache_dir=cache_dir)
    model = Wav2Vec2ForCTC.from_pretrained(
        model_id, revision=revision, cache_dir=cache_dir, output_hidden_states=True
    ).to("cuda")
    model.eval()

    sample_rate = 16_000
    waveform = torch.randn(sample_rate)  # 1 second of synthetic noise, not real speech data
    inputs = processor(waveform.numpy(), sampling_rate=sample_rate, return_tensors="pt")

    with torch.no_grad():
        outputs = model(inputs.input_values.to("cuda"))

    assert outputs.logits.shape[-1] == model.config.vocab_size
    assert outputs.hidden_states[-1].shape[-1] == encoder_config["hidden_size"]


def test_mlflow_local_tracking_round_trip(tmp_path, monkeypatch):
    import mlflow

    # MLflow >=3 disables the plain filesystem tracking backend by default;
    # ADR-0013 SS9.4 / roadmap SS9.4 intentionally use a local file-based
    # mlruns store, so this is an explicit opt-in, not a workaround.
    monkeypatch.setenv("MLFLOW_ALLOW_FILE_STORE", "true")

    tracking_uri = f"file://{tmp_path / 'mlruns'}"
    mlflow.set_tracking_uri(tracking_uri)
    experiment_id = mlflow.create_experiment("m0-smoke-test")

    with mlflow.start_run(experiment_id=experiment_id) as run:
        mlflow.log_param("smoke_test", "m0")
        mlflow.log_metric("dummy_metric", 1.0)
        run_id = run.info.run_id

    client = mlflow.tracking.MlflowClient(tracking_uri=tracking_uri)
    fetched = client.get_run(run_id)

    assert fetched.data.params["smoke_test"] == "m0"
    assert fetched.data.metrics["dummy_metric"] == 1.0
