"""M5 Provisional Score Normalization fitting (`evaluation/display_calibration.py`)
and the chance-corrected letter coverage the Content gate uses."""

from __future__ import annotations

import pytest

from echolingo_speech.evaluation.display_calibration import (
    adopted,
    fit,
    fit_linear,
    simulate_passages,
)
from echolingo_speech.worker.pipeline import (
    chance_character_coverage,
    corrected_character_coverage,
    reference_character_coverage,
)


def test_fit_linear_recovers_a_low_running_prediction():
    predictions = [5.0, 6.0, 7.0, 8.0]
    labels = [6.0, 7.2, 8.4, 9.6]  # 1.2 x - 0

    fitted = fit_linear(predictions, labels)

    assert fitted["slope"] == pytest.approx(1.2)
    assert fitted["intercept"] == pytest.approx(0.0, abs=1e-9)
    assert fitted["mae_after"] == pytest.approx(0.0, abs=1e-9)
    assert fitted["mae_before"] == pytest.approx(1.3)


@pytest.mark.parametrize(
    ("predictions", "labels"),
    [([1.0, 2.0, 3.0], [3.0, 2.0, 1.0]), ([2.0, 2.0], [1.0, 3.0]), ([1.0], [1.0])],
)
def test_fit_linear_refuses_a_map_that_is_not_increasing(predictions, labels):
    with pytest.raises(ValueError):
        fit_linear(predictions, labels)


def test_chance_coverage_keeps_letters_but_not_their_order():
    reference = ["we", "call", "it", "bear"]

    assert reference_character_coverage(reference, "we call it bear") == 1.0
    assert chance_character_coverage(reference, "we call it bear") < 1.0
    assert corrected_character_coverage(reference, "we call it bear") == 1.0
    assert corrected_character_coverage(reference, "") == 0.0


def test_corrected_coverage_is_zero_at_or_below_chance():
    reference = "the quick brown fox jumps over the lazy dog".split()
    unrelated = "a stitch in time saves nine and many hands make light work"

    assert reference_character_coverage(reference, unrelated) > 0.3
    assert corrected_character_coverage(reference, unrelated) < 0.2


def _row(speaker, index, reference, recognized):
    return {
        "speaker_id": speaker, "sample_id": f"{speaker}-{index}", "age_group": "adult",
        "reference": reference, "recognized": recognized,
        "sentence_prediction": {"accuracy": 6.0 + index % 3, "fluency": 6.5 + index % 3},
        "sentence_label": {"accuracy": 7.0 + index % 3, "fluency": 7.0 + index % 3},
        "words": [{"prediction": 7.0 + index % 2, "label": 8.0 + index % 2,
                   "phones": [[1.5 + 0.1 * (index % 2), 1.8 + 0.1 * (index % 2)]]}],
    }


SENTENCES = [
    "we call it bear", "born likes green", "the lake is very deep",
    "my brother plays the piano", "it rained all night long", "she reads a book",
    "they went to the market", "open the window please", "dogs bark at strangers",
    "a cold wind blew from the north", "he fixed the old bicycle", "we planted three trees",
]


def _rows():
    # Two speakers share the first sentences, as SpeechOcean speakers do.
    return [_row(speaker, i, text, text)
            for speaker, texts in (("a", SENTENCES[:6]), ("b", SENTENCES[:3] + SENTENCES[6:9]),
                                   ("c", SENTENCES[9:] + SENTENCES[3:6]))
            for i, text in enumerate(texts)]


def test_simulated_passages_separate_the_own_passage_from_another():
    report = simulate_passages(_rows())

    assert report["own_passage"]["min"] == 1.0
    assert report["wrong_passage"]["max"] < report["first_half_read"]["min"]
    assert report["first_half_read"]["max"] < 1.0


def test_fit_writes_one_increasing_map_per_dimension():
    calibration, report = fit(_rows(), bundle_id="speech-evaluator-v0.1.0")

    assert calibration["bundleId"] == "speech-evaluator-v0.1.0"
    assert set(calibration["sentence"]) == {"pronunciation", "oral_fluency"}
    for entry in (*calibration["sentence"].values(), calibration["word"], calibration["phone"]):
        assert entry["slope"] > 0
    assert calibration["labelScale"] == {"sentence": 10.0, "word": 10.0, "phone": 2.0}
    assert report["records"] == len(_rows())


def test_a_map_that_raises_the_absolute_error_is_not_adopted():
    # Exact except for one outlier, which least squares spreads over all.
    predictions = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 5.0]
    labels = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
    fitted = fit_linear(predictions, labels)

    assert fitted["mae_after"] > fitted["mae_before"]
    assert adopted(fitted) == {"slope": 1.0, "intercept": 0.0}
    better = fit_linear([5.0, 6.0, 7.0, 8.0], [6.0, 7.2, 8.4, 9.6])
    assert adopted(better)["slope"] == pytest.approx(1.2)


def test_fit_keeps_the_identity_when_no_increasing_map_exists():
    rows = _rows()
    for row in rows:
        for word in row["words"]:
            word["label"] = 10.0 - word["prediction"]   # decreasing
    calibration, report = fit(rows, bundle_id="speech-evaluator-v0.1.0")

    assert calibration["word"] == {"slope": 1.0, "intercept": 0.0}
    assert "not_fitted" in report["word"]


def test_chance_coverage_is_not_fooled_by_palindromes():
    reference = "a noon level did a".split()

    assert corrected_character_coverage(reference, "a noon level did a") == 1.0
