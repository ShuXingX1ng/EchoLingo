"""Multi-task loss composition tests: weighting math and masking edge cases,
against synthetic predictions/targets (no real data, no GPU required)."""

from __future__ import annotations

import torch
import torch.nn.functional as F

from echolingo_speech.training.dataset import PhoneExample, WordExample
from echolingo_speech.training.losses import (
    PHONE_WEIGHT,
    SENTENCE_WEIGHT,
    WORD_WEIGHT,
    compute_total_loss,
    phone_loss,
    sentence_loss,
    word_loss,
)


def test_sentence_loss_is_zero_for_perfect_prediction():
    targets = torch.tensor([[0.8, 0.9, 0.7, 1.0], [0.5, 0.5, 0.5, 0.5]])
    assert sentence_loss(targets.clone(), targets).item() == 0.0


def test_word_loss_averages_accuracy_huber_and_stress_bce_per_word_then_per_record():
    accuracy_pred = torch.tensor([0.9, 0.4])
    stress_logit_pred = torch.tensor([2.0, -2.0])
    examples = [WordExample(0, 1, 1.0, 1.0), WordExample(1, 2, 0.5, 0.0)]

    loss = word_loss(
        word_accuracy=[accuracy_pred],
        word_stress_logit=[stress_logit_pred],
        word_examples=[examples],
        word_alignment_valid=[True],
    )

    accuracy_targets = torch.tensor([1.0, 0.5])
    stress_targets = torch.tensor([1.0, 0.0])
    expected_accuracy_huber = F.huber_loss(accuracy_pred, accuracy_targets)
    expected_stress_bce = F.binary_cross_entropy_with_logits(stress_logit_pred, stress_targets)
    expected = (expected_accuracy_huber + expected_stress_bce) / 2

    assert torch.isclose(loss, expected)


def test_word_loss_excludes_invalid_records_and_handles_all_invalid_batch():
    valid_pred = torch.tensor([0.9])
    invalid_pred = torch.tensor([0.1])
    examples = [WordExample(0, 1, 1.0, 1.0)]

    loss = word_loss(
        word_accuracy=[valid_pred, invalid_pred],
        word_stress_logit=[torch.tensor([1.0]), torch.tensor([1.0])],
        word_examples=[examples, examples],
        word_alignment_valid=[True, False],
    )
    only_valid_loss = word_loss(
        word_accuracy=[valid_pred],
        word_stress_logit=[torch.tensor([1.0])],
        word_examples=[examples],
        word_alignment_valid=[True],
    )
    assert torch.isclose(loss, only_valid_loss)

    all_invalid_loss = word_loss(
        word_accuracy=[invalid_pred],
        word_stress_logit=[torch.tensor([1.0])],
        word_examples=[examples],
        word_alignment_valid=[False],
    )
    assert all_invalid_loss.item() == 0.0


def test_phone_loss_flattens_across_records_and_handles_no_valid_phones():
    pred_a = torch.tensor([0.9, 0.5])
    pred_b = torch.tensor([0.2])
    examples_a = [PhoneExample(0, 1, 1.0), PhoneExample(1, 2, 0.5)]
    examples_b = [PhoneExample(0, 1, 0.0)]

    loss = phone_loss([pred_a, pred_b], [examples_a, examples_b])
    expected = F.huber_loss(torch.cat([pred_a, pred_b]), torch.tensor([1.0, 0.5, 0.0]))
    assert torch.isclose(loss, expected)

    no_phones_loss = phone_loss([torch.zeros(0)], [[]])
    assert no_phones_loss.item() == 0.0


def test_compute_total_loss_applies_fixed_weights():
    sentence_scores = torch.tensor([[0.8, 0.9, 0.7, 1.0]])
    sentence_targets = torch.tensor([[0.5, 0.5, 0.5, 0.5]])
    word_examples = [[WordExample(0, 1, 1.0, 1.0)]]
    phone_examples = [[PhoneExample(0, 1, 1.0)]]

    predictions = {
        "sentence_scores": sentence_scores,
        "word_accuracy": [torch.tensor([0.9])],
        "word_stress_logit": [torch.tensor([2.0])],
        "phone_accuracy": [torch.tensor([0.9])],
    }
    batch = {
        "sentence_targets": sentence_targets,
        "word_examples": word_examples,
        "phone_examples": phone_examples,
        "word_alignment_valid": [True],
    }

    losses = compute_total_loss(predictions, batch)

    expected_total = (
        SENTENCE_WEIGHT * losses["sentence"]
        + WORD_WEIGHT * losses["word"]
        + PHONE_WEIGHT * losses["phone"]
    )
    assert torch.isclose(losses["total"], expected_total)
