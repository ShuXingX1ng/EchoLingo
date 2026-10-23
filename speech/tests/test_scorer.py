"""SpeechEvaluatorA0 forward-pass shape/range tests against a tiny synthetic
batch (no real data, no GPU required)."""

from __future__ import annotations

import torch

from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.dataset import PhoneExample, WordExample


def _synthetic_batch() -> dict:
    batch_size, max_frames, hidden_dim, num_acoustic = 2, 20, 768, 9

    hidden_states = torch.randn(batch_size, max_frames, hidden_dim)
    frame_mask = torch.ones(batch_size, max_frames, dtype=torch.bool)
    frame_mask[1, 15:] = False  # sample 1 is shorter, rest is padding

    return {
        "hidden_states": hidden_states,
        "frame_mask": frame_mask,
        "acoustic_features": torch.randn(batch_size, num_acoustic),
        "word_examples": [
            [WordExample(0, 5, 0.8, 1.0), WordExample(5, 10, 0.6, 0.0)],
            [],  # sample 1 has masked/invalid word alignment
        ],
        "phone_examples": [
            [PhoneExample(0, 2, 1.0), PhoneExample(2, 4, 0.5), PhoneExample(4, 5, 0.0)],
            [],
        ],
    }


def test_forward_produces_expected_shapes_and_ranges():
    model = SpeechEvaluatorA0()
    model.eval()
    batch = _synthetic_batch()

    with torch.no_grad():
        output = model(batch)

    assert output["sentence_scores"].shape == (2, 4)
    assert torch.all(output["sentence_scores"] >= 0.0)
    assert torch.all(output["sentence_scores"] <= 1.0)

    assert len(output["word_accuracy"]) == 2
    assert output["word_accuracy"][0].shape == (2,)
    assert output["word_accuracy"][1].shape == (0,)
    assert torch.all(output["word_accuracy"][0] >= 0.0)
    assert torch.all(output["word_accuracy"][0] <= 1.0)

    assert len(output["word_stress_logit"]) == 2
    assert output["word_stress_logit"][0].shape == (2,)
    assert output["word_stress_logit"][1].shape == (0,)

    assert len(output["phone_accuracy"]) == 2
    assert output["phone_accuracy"][0].shape == (3,)
    assert output["phone_accuracy"][1].shape == (0,)


def test_forward_is_differentiable_end_to_end():
    model = SpeechEvaluatorA0()
    batch = _synthetic_batch()

    output = model(batch)
    loss = output["sentence_scores"].sum() + output["word_accuracy"][0].sum()
    loss.backward()

    assert model.sentence_pooling.attention.weight.grad is not None
    assert model.word_accuracy_head.weight.grad is not None


def test_acoustic_normalization_equals_feeding_standardized_features():
    torch.manual_seed(0)
    batch = _synthetic_batch()
    mean = torch.full((9,), 2.0)
    std = torch.full((9,), 4.0)

    normalized = SpeechEvaluatorA0(dropout=0.0, normalize_acoustic_features=True)
    normalized.set_acoustic_normalization(mean, std)
    plain = SpeechEvaluatorA0(dropout=0.0)
    plain.load_state_dict(
        {k: v for k, v in normalized.state_dict().items() if not k.startswith("acoustic_")}
    )
    normalized.eval()
    plain.eval()

    standardized = dict(batch, acoustic_features=(batch["acoustic_features"] - mean) / std)
    with torch.no_grad():
        expected = plain(standardized)["sentence_scores"]
        actual = normalized(batch)["sentence_scores"]
    assert torch.allclose(actual, expected)


def test_acoustic_normalization_is_off_by_default():
    model = SpeechEvaluatorA0()
    assert model.config["normalize_acoustic_features"] is False
    assert not any(key.startswith("acoustic_") for key in model.state_dict())


def test_canonical_phones_feed_word_and_phone_heads():
    torch.manual_seed(0)
    batch = _synthetic_batch()
    model = SpeechEvaluatorA0(dropout=0.0, use_canonical_phones=True)
    model.eval()

    with torch.no_grad():
        before = model(batch)
        for word in batch["word_examples"][0]:
            word.phone_ids = [3, 7]
        for phone in batch["phone_examples"][0]:
            phone.phone_id = 5
        after = model(batch)

    assert after["word_accuracy"][0].shape == (2,)
    assert after["phone_accuracy"][0].shape == (3,)
    assert after["word_accuracy"][1].shape == (0,)
    assert not torch.allclose(before["word_accuracy"][0], after["word_accuracy"][0])
    assert not torch.allclose(before["phone_accuracy"][0], after["phone_accuracy"][0])
    # Sentence heads never see phone identities.
    assert torch.allclose(before["sentence_scores"], after["sentence_scores"])


def test_canonical_phones_are_off_by_default():
    model = SpeechEvaluatorA0()
    assert model.config["use_canonical_phones"] is False
    assert not hasattr(model, "phone_embedding")


def test_multi_layer_input_is_mixed_by_learned_layer_weights():
    torch.manual_seed(0)
    batch = _synthetic_batch()
    layered = SpeechEvaluatorA0(dropout=0.0, num_hidden_layers=3)
    single = SpeechEvaluatorA0(dropout=0.0)
    single.load_state_dict(
        {k: v for k, v in layered.state_dict().items() if k != "layer_weights"}
    )
    layered.eval()
    single.eval()

    stacked = torch.randn(2, 3, 20, 768)
    with torch.no_grad():
        # Zero-initialized weights -> uniform softmax -> the layer mean.
        expected = single(dict(batch, hidden_states=stacked.mean(dim=1)))["sentence_scores"]
        actual = layered(dict(batch, hidden_states=stacked))["sentence_scores"]
    assert torch.allclose(actual, expected, atol=1e-6)
    assert layered.layer_weights.requires_grad
