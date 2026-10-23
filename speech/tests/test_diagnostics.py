"""M2.5 diagnostics against tiny synthetic `ScoringExample`s on CPU (no real
data, no GPU), in the fixture style of `tests/test_baseline.py`."""

from __future__ import annotations

import pytest
import torch

from echolingo_speech.evaluation.diagnostics import (
    average_precision,
    best_threshold,
    collect_outputs,
    confusion_matrix,
    diagnose_records,
    distribution,
    mask_coverage,
)
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.config import TrainingConfig
from echolingo_speech.training.dataset import PhoneExample, ScoringExample, WordExample, collate_fn
from echolingo_speech.training.losses import compute_total_loss


def _make_example(
    sample_id: str, accuracy: float, *, word_alignment_valid: bool = True
) -> ScoringExample:
    words = [WordExample(0, 3, accuracy, 1.0), WordExample(3, 6, 1.0 - accuracy, 0.0)]
    phones = [PhoneExample(0, 1, accuracy), PhoneExample(1, 2, 1.0 - accuracy)]
    return ScoringExample(
        sample_id=sample_id,
        hidden_states=torch.randn(10, 768),
        sentence_targets=torch.tensor([accuracy, 1.0 - accuracy, accuracy, 1.0]),
        acoustic_features=torch.randn(9),
        word_examples=words if word_alignment_valid else [],
        phone_examples=phones if word_alignment_valid else [],
        word_alignment_valid=word_alignment_valid,
    )


def test_confusion_matrix_counts_error_class_below_threshold():
    confusion = confusion_matrix([0.1, 0.9, 0.2, 0.8], [0.1, 0.1, 0.9, 0.9], threshold=0.5)
    assert confusion == {"true_error": 1, "false_error": 1, "missed_error": 1, "true_correct": 1}


def test_average_precision_is_one_for_perfect_ranking_and_matches_hand_value():
    assert average_precision([0.9, 0.8, 0.1], [True, True, False]) == pytest.approx(1.0)
    # Ranked: neg, pos, pos -> precision at the two hits is 1/2 and 2/3.
    assert average_precision([0.9, 0.8, 0.7], [False, True, True]) == pytest.approx(
        (1 / 2 + 2 / 3) / 2
    )
    assert average_precision([0.5], [False]) == 0.0


def test_best_threshold_finds_split_a_fixed_threshold_misses():
    # Every prediction sits above 0.6, so the fixed threshold never flags an
    # error, yet the predictions still rank the errors first.
    preds = [0.70, 0.72, 0.90, 0.95]
    targets = [0.2, 0.3, 0.9, 1.0]
    best = best_threshold(preds, targets, label_threshold=0.6)
    assert best["threshold"] == pytest.approx(0.72)
    assert best["macro_f1"] == pytest.approx(1.0)


def test_distribution_reports_fraction_below_threshold_and_histogram():
    stats = distribution([0.05, 0.55, 0.65, 0.95], threshold=0.6)
    assert stats["n"] == 4
    assert stats["fraction_below_threshold"] == pytest.approx(0.5)
    assert sum(stats["histogram"]) == 4
    assert stats["histogram"][0] == 1 and stats["histogram"][9] == 1
    assert distribution([], threshold=0.6) == {"n": 0}


def test_mask_coverage_counts_supervised_words_and_phones():
    examples = [_make_example("a", 0.8), _make_example("b", 0.4, word_alignment_valid=False)]
    counts = {"a": (2, 3), "b": (2, 2)}
    coverage = mask_coverage(examples, counts)
    assert coverage["records"] == 2
    assert coverage["records_with_valid_word_alignment"] == 1
    assert coverage["word_coverage"] == pytest.approx(2 / 4)
    assert coverage["phone_coverage"] == pytest.approx(2 / 5)


def test_loss_components_sum_back_to_training_total_loss():
    torch.manual_seed(0)
    examples = [_make_example(f"s{i}", accuracy) for i, accuracy in enumerate([0.2, 0.5, 0.8, 1.0])]
    examples.append(_make_example("masked", 0.3, word_alignment_valid=False))
    model = SpeechEvaluatorA0(dropout=0.0)
    model.eval()

    records = collect_outputs(model, examples, {}, "cpu", batch_size=len(examples))
    report = diagnose_records(records, TrainingConfig())

    with torch.no_grad():
        batch = collate_fn(examples)
        expected = compute_total_loss(model(batch), batch)
    losses = report["loss_components"]
    assert losses["total"] == pytest.approx(float(expected["total"]), rel=1e-5)
    assert losses["sentence"] == pytest.approx(float(expected["sentence"]), rel=1e-5)
    assert losses["phone_huber"] == pytest.approx(float(expected["phone"]), rel=1e-5)
    word = (losses["word_accuracy_huber"] + losses["word_stress_bce"]) / 2
    assert word == pytest.approx(float(expected["word"]), rel=1e-5)
    assert sum(losses["share_of_total"].values()) == pytest.approx(1.0)


def test_diagnose_records_reports_age_groups_and_skips_masked_words():
    examples = [_make_example("adult0", 0.9), _make_example("child0", 0.3)]
    examples.append(_make_example("child1", 0.5, word_alignment_valid=False))
    age_groups = {"adult0": "adult", "child0": "child", "child1": "child"}
    model = SpeechEvaluatorA0(dropout=0.0)

    records = collect_outputs(model, examples, age_groups, "cpu")
    report = diagnose_records(records, TrainingConfig())

    assert report["records"] == 3
    assert set(report["by_age_group"]) == {"adult", "child"}
    assert report["by_age_group"]["child"]["records"] == 2
    # Two valid records x two words; the masked record contributes none.
    assert report["word_error_detection"]["prediction_distribution"]["n"] == 4
    assert sum(report["word_error_detection"]["confusion"].values()) == 4
