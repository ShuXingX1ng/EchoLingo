"""M3 A0-Aug: length-preserving audio augmentation (`features/augment.py`)."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import torch

from echolingo_speech.data.manifest import FeatureInfo
from echolingo_speech.features.augment import (
    PROFILES,
    add_noise,
    add_reverb,
    augment_waveform,
    synthetic_room_response,
    telephone_codec,
    utterance_generator,
    write_augmented_waveforms,
)
from echolingo_speech.features.cache import variant_feature_root

SAMPLE_RATE = 16000


def _speech_like(seconds: float = 1.0, freq: float = 220.0) -> torch.Tensor:
    t = torch.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (0.3 * torch.sin(2 * math.pi * freq * t)).unsqueeze(0)


def _rms(waveform: torch.Tensor) -> float:
    return waveform.pow(2).mean().sqrt().item()


def test_every_profile_keeps_the_exact_length_and_peak_limit():
    clean = _speech_like(1.37)
    for profile in PROFILES.values():
        for copy in range(20):
            out, applied = augment_waveform(clean, profile, utterance_generator(0, copy, "S"))
            assert out.shape == clean.shape
            assert out.abs().max().item() <= 0.99 + 1e-6
            assert -6.0 <= applied["gain_db"] <= 6.0


def test_robustness_profile_always_adds_noise():
    clean = _speech_like()
    for copy in range(10):
        _, applied = augment_waveform(
            clean, PROFILES["robustness"], utterance_generator(0, copy, "S")
        )
        assert 10.0 <= applied["noise"]["snr_db"] <= 20.0


def test_a_copy_is_reproducible_and_copies_differ():
    clean = _speech_like()
    profile = PROFILES["train"]
    first, _ = augment_waveform(clean, profile, utterance_generator(7, 1, "S"))
    again, _ = augment_waveform(clean, profile, utterance_generator(7, 1, "S"))
    other, _ = augment_waveform(clean, profile, utterance_generator(7, 2, "S"))
    assert torch.equal(first, again)
    assert not torch.equal(first, other)


def test_noise_is_added_at_the_requested_snr():
    clean = _speech_like()
    for alpha in (0.0, 1.0, 2.0):
        noisy = add_noise(clean, 20.0, alpha, torch.Generator().manual_seed(0))
        snr = 20 * math.log10(_rms(clean) / _rms(noisy - clean))
        assert abs(snr - 20.0) < 0.1


def test_room_response_has_a_unit_direct_path_and_the_requested_drr():
    response = synthetic_room_response(0.3, 6.0, torch.Generator().manual_seed(0), SAMPLE_RATE)
    assert response[0].item() == 1.0
    assert response.shape == (int(0.3 * SAMPLE_RATE),)
    drr = 10 * math.log10(1.0 / response[1:].pow(2).sum().item())
    assert abs(drr - 6.0) < 1e-3


def test_reverb_keeps_length_level_and_timing():
    clean = torch.zeros(1, SAMPLE_RATE)
    clean[0, 8000:8400] = _speech_like(0.025)[0]
    wet = add_reverb(clean, 0.4, 3.0, torch.Generator().manual_seed(0))
    assert wet.shape == clean.shape
    assert abs(_rms(wet) - _rms(clean)) < 1e-6
    # Nothing moves earlier than the direct path (up to FFT rounding).
    assert wet[0, :8000].abs().max().item() < 1e-6
    assert wet[0, 8000:8400].abs().max().item() > 0.1


def test_telephone_codec_keeps_length_and_removes_the_upper_band():
    low = _speech_like(1.0, 300.0)
    high = _speech_like(1.0, 6000.0)
    assert telephone_codec(low).shape == low.shape
    assert _rms(telephone_codec(low)) > 0.9 * _rms(low)
    assert _rms(telephone_codec(high)) < 0.1 * _rms(high)


def test_write_augmented_waveforms_mirrors_the_clean_cache_layout(tmp_path: Path):
    class _Record:
        def __init__(self, sample_id: str) -> None:
            self.sample_id = sample_id
            self.features = FeatureInfo(
                waveform_cache_path=f"waveform/{sample_id}.npy",
                wav2vec2_hidden_state_path=f"hidden/{sample_id}.npy",
                encoder_revision="abc",
                code_version="test",
            )

    feature_root = tmp_path / "features"
    (feature_root / "waveform").mkdir(parents=True)
    records = [_Record("A"), _Record("B")]
    for record in records:
        np.save(feature_root / record.features.waveform_cache_path, _speech_like(0.5).numpy())

    root = write_augmented_waveforms(
        records, feature_root=feature_root, variant="train-aug-1",
        profile=PROFILES["train"], seed=0, copy=1,
    )
    assert root == variant_feature_root(feature_root, "train-aug-1")
    for record in records:
        augmented = np.load(root / record.features.waveform_cache_path)
        assert augmented.shape == (1, 8000)
        assert augmented.dtype == np.float32
    effects = json.loads((root / "effects.json").read_text())
    assert set(effects) == {"A", "B"}
    # The clean cache is untouched.
    assert np.array_equal(np.load(feature_root / "waveform/A.npy"), _speech_like(0.5).numpy())
