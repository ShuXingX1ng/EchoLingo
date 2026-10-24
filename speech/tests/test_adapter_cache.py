"""M3 A1-Scorer feature caches: layers extracted with the CTC LoRA adapter
merged into the encoder live in their own directory, record which adapter
made them, and a checkpoint is only ever scored on the cache it trained on."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import torch
import yaml
from pydantic import ValidationError

from echolingo_speech.encoder.lora import (
    LoRAConfig,
    adapter_sha256,
    inject_lora,
    lora_modules,
    save_adapter,
)
from echolingo_speech.features.cache import extract_layer_features, layer_cache_dir_name
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.config import TrainingConfig
from echolingo_speech.training.loop import check_feature_cache

TRAINING_CONFIGS = Path(__file__).resolve().parents[1] / "configs" / "training"


def test_adapter_layers_live_in_their_own_cache_directory():
    revision = "22aad52d435eb6dbaf354bdad9b0da84ce7d6156"
    raw = layer_cache_dir_name(revision, [4, 12])
    assert layer_cache_dir_name(revision, [4, 12], adapter="a1-loquacious-small") == (
        raw + "-adapter-a1-loquacious-small"
    )
    assert layer_cache_dir_name(revision, [4, 12], adapter=None) == raw


def test_the_a1_scorer_is_3_2c_plus_the_adapter():
    def load(name: str) -> dict:
        return yaml.safe_load((TRAINING_CONFIGS / name).read_text())

    a1 = load("m3-a1-scorer.yaml")
    assert a1.pop("encoder_adapter") == "a1-loquacious-small"
    assert a1 == load("m3-aug-mask-audio.yaml")
    TrainingConfig(**load("m3-a1-scorer.yaml"))


def test_an_adapter_cache_exists_only_for_the_raw_encoder_input():
    with pytest.raises(ValidationError, match="raw encoder input"):
        TrainingConfig(encoder_adapter="a1", normalize_encoder_input=True)


def test_a_checkpoint_is_refused_on_another_adapter_cache():
    adapted = SpeechEvaluatorA0(encoder_adapter="a1")
    check_feature_cache(adapted, TrainingConfig(encoder_adapter="a1"), Path("a.pt"))
    with pytest.raises(ValueError, match="encoder_adapter=a1"):
        check_feature_cache(adapted, TrainingConfig(), Path("a.pt"))
    with pytest.raises(ValueError, match="encoder_adapter=None"):
        check_feature_cache(SpeechEvaluatorA0(), TrainingConfig(encoder_adapter="a1"), Path("r.pt"))
    with pytest.raises(ValueError, match="encoder_adapter=a1"):
        check_feature_cache(adapted, TrainingConfig(encoder_adapter="a2"), Path("a.pt"))


def _encoder_and_adapters(tiny_wav2vec2_config, tmp_path: Path):
    """A saved tiny encoder, two different adapters for it under one name and
    one adapter for another encoder revision."""
    from transformers import Wav2Vec2Model

    torch.manual_seed(0)
    model_dir = tmp_path / "encoder"
    Wav2Vec2Model(tiny_wav2vec2_config).save_pretrained(model_dir)
    adapters = {}
    for key, seed, revision in (("first", 1, "abc"), ("second", 2, "abc"), ("other", 1, "def")):
        model = Wav2Vec2Model.from_pretrained(model_dir).eval()
        inject_lora(model, LoRAConfig(rank=4, alpha=8.0))
        generator = torch.Generator().manual_seed(seed)
        with torch.no_grad():
            for module in lora_modules(model).values():
                module.lora_B.copy_(0.1 * torch.randn(module.lora_B.shape, generator=generator))
        adapters[key] = save_adapter(
            model, LoRAConfig(rank=4, alpha=8.0), tmp_path / "adapters" / key,
            {"name": "tiny-adapter", "encoder_model_id": str(model_dir),
             "encoder_revision": revision, "step": 7},
        )
        if key == "first":
            adapted_model = model
    return model_dir, adapters, adapted_model


def test_extract_layers_with_an_adapter(tiny_wav2vec2_config, tmp_path: Path):
    model_dir, adapters, adapted_model = _encoder_and_adapters(tiny_wav2vec2_config, tmp_path)
    cache_root = tmp_path / "features"
    (cache_root / "waveform").mkdir(parents=True)
    waveform = 0.1 * torch.randn(1, 4000)
    np.save(cache_root / "waveform" / "S1.npy", waveform.numpy())
    features = SimpleNamespace(waveform_cache_path="waveform/S1.npy")
    records = [SimpleNamespace(sample_id="S1", features=features)]

    def extract(**kwargs) -> Path:
        return extract_layer_features(
            records, cache_root=cache_root, encoder_model_id=str(model_dir),
            encoder_revision="abc", layers=(1, 2), **kwargs,
        )

    raw_dir = extract()
    adapted_dir = extract(adapter_dir=adapters["first"])
    assert adapted_dir.name == layer_cache_dir_name("abc", (1, 2), adapter="tiny-adapter")
    raw = np.load(raw_dir / "S1.npy").astype(np.float32)
    adapted = np.load(adapted_dir / "S1.npy").astype(np.float32)
    with torch.no_grad():
        expected = adapted_model(waveform, output_hidden_states=True).hidden_states
    assert adapted.shape == raw.shape == (2, expected[1].shape[1], 32)
    for index, layer in enumerate((1, 2)):
        assert np.allclose(adapted[index], expected[layer][0].numpy(), atol=1e-2)
    assert not np.allclose(adapted, raw, atol=1e-2)
    provenance = json.loads((adapted_dir / "adapter.json").read_text())
    assert provenance["name"] == "tiny-adapter" and provenance["step"] == 7
    assert provenance["sha256"] == adapter_sha256(adapters["first"])

    extract(adapter_dir=adapters["first"])  # the same adapter again is fine
    with pytest.raises(ValueError, match="another adapter named 'tiny-adapter'"):
        extract(adapter_dir=adapters["second"])
    with pytest.raises(ValueError, match="encoder_revision def, not abc"):
        extract(adapter_dir=adapters["other"])
    with pytest.raises(ValueError, match="raw waveform"):
        extract(adapter_dir=adapters["first"], normalize_input=True)
