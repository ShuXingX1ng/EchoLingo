"""M3 A1 LoRA: an injected adapter starts as the original layer, merges into
a plain `nn.Linear` with the same output, and moves from the CTC model it
trains in to the plain encoder the feature cache extracts from."""

from __future__ import annotations

from pathlib import Path

import pytest
import torch
from torch import nn

from echolingo_speech.encoder.lora import (
    LoRAConfig,
    LoRALinear,
    adapter_sha256,
    apply_adapter,
    inject_lora,
    load_lora_state,
    lora_modules,
    lora_parameters,
    lora_state_dict,
    merge_lora,
    save_adapter,
)


def _randomize_lora(model: nn.Module, seed: int = 0) -> None:
    generator = torch.Generator().manual_seed(seed)
    with torch.no_grad():
        for module in lora_modules(model).values():
            module.lora_B.copy_(0.1 * torch.randn(module.lora_B.shape, generator=generator))


def test_a_new_lora_layer_is_the_base_layer():
    torch.manual_seed(0)
    base = nn.Linear(8, 6)
    x = torch.randn(4, 8)
    expected = base(x)
    wrapped = LoRALinear(base, rank=2, alpha=4.0, dropout=0.0)
    assert torch.equal(wrapped(x), expected)
    assert not any(p.requires_grad for p in wrapped.base.parameters())
    assert wrapped.lora_A.requires_grad and wrapped.lora_B.requires_grad


def test_the_merged_layer_matches_the_lora_forward():
    torch.manual_seed(0)
    wrapped = LoRALinear(nn.Linear(8, 6), rank=2, alpha=4.0, dropout=0.5).eval()
    with torch.no_grad():
        wrapped.lora_B.normal_()
    x = torch.randn(4, 8)
    merged = wrapped.merged()
    assert isinstance(merged, nn.Linear)
    assert torch.allclose(merged(x), wrapped(x), atol=1e-6)
    assert not torch.allclose(merged(x), wrapped.base(x))


def test_inject_wraps_q_and_v_of_every_encoder_layer(tiny_wav2vec2_config):
    from transformers import Wav2Vec2Model

    torch.manual_seed(0)
    model = Wav2Vec2Model(tiny_wav2vec2_config).eval()
    audio = torch.randn(1, 4000)
    before = model(audio).last_hidden_state
    names = inject_lora(model, LoRAConfig(rank=4, alpha=8.0))
    assert names == [
        "encoder.layers.0.attention.q_proj", "encoder.layers.0.attention.v_proj",
        "encoder.layers.1.attention.q_proj", "encoder.layers.1.attention.v_proj",
    ]
    # Zero-initialized B: the injected encoder is still the original one.
    assert torch.equal(model(audio).last_hidden_state, before)
    # Trainable: A (4 x 32) and B (32 x 4) per wrapped projection.
    assert sum(p.numel() for p in lora_parameters(model)) == 4 * (4 * 32 + 32 * 4)
    with pytest.raises(ValueError, match="already has LoRA"):
        inject_lora(model, LoRAConfig(rank=4))


def test_the_adapter_moves_from_the_ctc_model_to_the_plain_encoder(
    tiny_wav2vec2_config, tmp_path: Path
):
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Model

    torch.manual_seed(0)
    ctc = Wav2Vec2ForCTC(tiny_wav2vec2_config).eval()
    plain = Wav2Vec2Model(tiny_wav2vec2_config).eval()
    plain.load_state_dict(ctc.wav2vec2.state_dict())
    plain_keys = set(plain.state_dict())
    config = LoRAConfig(rank=4, alpha=8.0)
    inject_lora(ctc.wav2vec2, config)
    _randomize_lora(ctc.wav2vec2)
    save_adapter(ctc.wav2vec2, config, tmp_path, {"name": "tiny", "encoder_revision": "abc"})

    metadata = apply_adapter(plain, tmp_path, encoder_revision="abc")
    assert metadata["name"] == "tiny"
    # Merged away: the plain encoder keeps its own parameter names.
    assert lora_modules(plain) == {}
    assert set(plain.state_dict()) == plain_keys
    audio = torch.randn(1, 4000)
    adapted = ctc.wav2vec2(audio, output_hidden_states=True).hidden_states
    merged = plain(audio, output_hidden_states=True).hidden_states
    for expected, actual in zip(adapted, merged):
        assert torch.allclose(actual, expected, atol=1e-5)
    assert not torch.allclose(merged[-1], Wav2Vec2Model(tiny_wav2vec2_config).eval()(audio)[0])


def test_an_adapter_for_another_encoder_is_refused_untouched(tiny_wav2vec2_config, tmp_path):
    from transformers import Wav2Vec2Model

    source = Wav2Vec2Model(tiny_wav2vec2_config)
    inject_lora(source, LoRAConfig(rank=4))
    save_adapter(source, LoRAConfig(rank=4), tmp_path,
                 {"name": "tiny", "encoder_model_id": "tiny-encoder", "encoder_revision": "abc"})
    target = Wav2Vec2Model(tiny_wav2vec2_config)
    with pytest.raises(ValueError, match="encoder_revision abc, not def"):
        apply_adapter(target, tmp_path, encoder_revision="def")
    with pytest.raises(ValueError, match="encoder_model_id tiny-encoder, not other"):
        apply_adapter(target, tmp_path, encoder_model_id="other", encoder_revision="abc")
    assert lora_modules(target) == {}


def test_lora_state_round_trips_and_rejects_other_layouts(tiny_wav2vec2_config):
    from transformers import Wav2Vec2Model

    source = Wav2Vec2Model(tiny_wav2vec2_config)
    inject_lora(source, LoRAConfig(rank=4))
    _randomize_lora(source)
    state = lora_state_dict(source)
    target = Wav2Vec2Model(tiny_wav2vec2_config)
    inject_lora(target, LoRAConfig(rank=4))
    load_lora_state(target, state)
    assert all(torch.equal(state[k], v) for k, v in lora_state_dict(target).items())

    q_only = Wav2Vec2Model(tiny_wav2vec2_config)
    inject_lora(q_only, LoRAConfig(rank=4, target_modules=("q_proj",)))
    with pytest.raises(ValueError, match="adapter state mismatch"):
        load_lora_state(q_only, state)


def test_merge_counts_and_the_fingerprint_follows_the_weights(tiny_wav2vec2_config, tmp_path):
    from transformers import Wav2Vec2Model

    model = Wav2Vec2Model(tiny_wav2vec2_config)
    inject_lora(model, LoRAConfig(rank=4))
    save_adapter(model, LoRAConfig(rank=4), tmp_path / "a", {})
    _randomize_lora(model)
    save_adapter(model, LoRAConfig(rank=4), tmp_path / "b", {})
    assert adapter_sha256(tmp_path / "a") != adapter_sha256(tmp_path / "b")
    assert merge_lora(model) == 4
    assert merge_lora(model) == 0
