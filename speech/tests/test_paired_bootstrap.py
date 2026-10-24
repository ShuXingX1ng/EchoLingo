"""Speaker-level paired bootstrap of candidate-minus-reference metrics."""

from __future__ import annotations

import numpy as np
import pytest

from echolingo_speech.evaluation.paired_bootstrap import RecordOutputs, paired_bootstrap


def _records(noise: float, seed: int = 0) -> dict[str, RecordOutputs]:
    """Six speakers x four records; predictions are the targets plus noise."""
    rng = np.random.default_rng(seed)
    target_rng = np.random.default_rng(123)
    records = {}
    for speaker in range(6):
        for utterance in range(4):
            sentence = {key: float(target_rng.uniform(0.3, 1.0)) for key in
                        ("accuracy", "fluency", "prosodic", "completeness")}
            words = list(target_rng.choice([0.2, 0.5, 0.9, 1.0], size=5))
            phones = list(target_rng.choice([0.0, 0.5, 1.0], size=8))
            records[f"S{speaker}-{utterance}"] = RecordOutputs(
                sentence_preds={k: v + float(rng.normal(0, noise)) for k, v in sentence.items()},
                sentence_targets=sentence,
                word_preds=[w + float(rng.normal(0, noise)) for w in words],
                word_targets=[float(w) for w in words],
                phone_preds=[p + float(rng.normal(0, noise)) for p in phones],
                phone_targets=[float(p) for p in phones],
            )
    return records


SPEAKERS = {f"S{s}-{u}": f"spk{s}" for s in range(6) for u in range(4)}


def test_identical_checkpoints_differ_by_exactly_zero():
    records = _records(0.2)
    result = paired_bootstrap(records, records, SPEAKERS, resamples=50)
    for name, row in result.items():
        if name == "_meta":
            continue
        assert row["difference"] == 0.0
        assert row["ci_low"] == row["ci_high"] == 0.0
        assert row["share_better"] == 0.0
    assert result["_meta"] == {"speakers": 6, "records": 24, "resamples": 50}


def test_a_cleaner_candidate_is_better_on_every_metric():
    result = paired_bootstrap(_records(0.3), _records(0.02, seed=1), SPEAKERS, resamples=200)
    for name, row in result.items():
        if name == "_meta":
            continue
        assert row["difference"] > 0, name
        assert row["ci_low"] <= row["difference"] <= row["ci_high"], name
        assert row["share_better"] > 0.9, name


def test_resampling_is_reproducible_per_seed():
    reference, candidate = _records(0.3), _records(0.1, seed=1)
    first = paired_bootstrap(reference, candidate, SPEAKERS, resamples=100, seed=3)
    again = paired_bootstrap(reference, candidate, SPEAKERS, resamples=100, seed=3)
    assert first == again


def test_checkpoints_must_be_scored_on_the_same_records():
    reference = _records(0.2)
    candidate = dict(reference)
    candidate.pop("S0-0")
    with pytest.raises(ValueError, match="different records"):
        paired_bootstrap(reference, candidate, SPEAKERS)


def test_collect_record_outputs_keeps_the_mask_valid_pairs_per_record():
    import torch
    from torch.utils.data import DataLoader

    from echolingo_speech.evaluation.paired_bootstrap import collect_record_outputs
    from echolingo_speech.models.scorer import SpeechEvaluatorA0
    from echolingo_speech.training.dataset import (
        PhoneExample,
        ScoringExample,
        WordExample,
        collate_fn,
    )

    def example(sample_id: str, valid: bool) -> ScoringExample:
        return ScoringExample(
            sample_id=sample_id,
            hidden_states=torch.randn(10, 768),
            sentence_targets=torch.tensor([0.8, 0.7, 0.6, 1.0]),
            acoustic_features=torch.randn(9),
            word_examples=[WordExample(0, 5, 0.9, 1.0), WordExample(5, 10, 0.3, 1.0)],
            phone_examples=[PhoneExample(0, 2, 1.0)],
            word_alignment_valid=valid,
        )

    examples = [example("A", True), example("B", False)]
    loader = DataLoader(examples, batch_size=2, collate_fn=collate_fn)
    outputs = collect_record_outputs(SpeechEvaluatorA0(), loader, "cpu")
    assert set(outputs) == {"A", "B"}
    assert outputs["A"].word_targets == [0.9, 0.3]
    assert len(outputs["A"].word_preds) == 2
    assert outputs["B"].word_preds == [] and outputs["B"].word_targets == []
    assert outputs["B"].phone_targets == [1.0]
    assert outputs["A"].sentence_targets["accuracy"] == pytest.approx(0.8)
