"""M3 input normalization: the encoder sees zero-mean, unit-variance audio,
cached separately from the raw-input layers, and a checkpoint is only ever
scored on the cache it was trained on."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import torch

from echolingo_speech.features.cache import layer_cache_dir_name, normalize_encoder_input
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.config import TrainingConfig
from echolingo_speech.training.loop import check_feature_cache


def test_normalized_input_has_zero_mean_and_unit_variance():
    waveform = 0.05 * torch.randn(1, 16000) + 0.01
    normalized = normalize_encoder_input(waveform)
    assert normalized.shape == waveform.shape
    assert abs(normalized.mean().item()) < 1e-6
    assert normalized.pow(2).mean().item() == pytest.approx(1.0, rel=1e-4)
    # Silence stays finite.
    assert torch.isfinite(normalize_encoder_input(torch.zeros(1, 100))).all()


def test_matches_the_transformers_feature_extractor():
    transformers = pytest.importorskip("transformers")
    waveform = (0.1 * np.random.default_rng(0).standard_normal(8000) + 0.02).astype(np.float32)
    expected = transformers.Wav2Vec2FeatureExtractor.zero_mean_unit_var_norm(
        [waveform], attention_mask=None
    )[0]
    actual = normalize_encoder_input(torch.from_numpy(waveform).unsqueeze(0))[0].numpy()
    assert np.allclose(actual, expected, atol=1e-5)


def test_normalized_layers_live_in_their_own_cache_directory():
    raw = layer_cache_dir_name("22aad52d435eb6dbaf354bdad9b0da84ce7d6156", [4, 12])
    norm = layer_cache_dir_name("22aad52d435eb6dbaf354bdad9b0da84ce7d6156", [4, 12], True)
    assert raw == "wav2vec2-layers-22aad52d435e-l4-12"
    assert norm == raw + "-norm"


def test_a_checkpoint_is_refused_on_the_other_cache():
    normalized = SpeechEvaluatorA0(encoder_input_normalized=True)
    check_feature_cache(normalized, TrainingConfig(normalize_encoder_input=True), Path("n.pt"))
    with pytest.raises(ValueError, match="encoder_input_normalized=True"):
        check_feature_cache(normalized, TrainingConfig(), Path("n.pt"))
    with pytest.raises(ValueError, match="encoder_input_normalized=False"):
        check_feature_cache(
            SpeechEvaluatorA0(), TrainingConfig(normalize_encoder_input=True), Path("r.pt")
        )
