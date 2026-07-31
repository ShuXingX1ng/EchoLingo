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
