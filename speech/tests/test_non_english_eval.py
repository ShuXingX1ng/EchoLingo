"""Non-English recordings and the `reference_not_read` gate (`evaluation/non_english.py`)."""
from __future__ import annotations

from echolingo_speech.evaluation import non_english as ne


def _row(kind, reason=None, coverage=0.02, error=None, language="zh_CN"):
    row = {"clip": "c", "language": language, "passage": "exercise", "kind": kind}
    if error:
        row["error"] = error
    else:
        row.update(coverage_corrected=coverage, gate=0.1, word_reason=reason)
    return row


def test_each_clip_is_judged_against_its_own_and_the_other_passages():
    english = {"language": "en_US", "passage": "coffee"}
    assert ne.kind(english, "coffee") == "english_own"
    assert ne.kind(english, "library") == "english_other"
    assert ne.kind({"language": "fr_FR", "passage": None}, "coffee") == "non_english"


def test_it_passes_when_non_english_is_held_below_the_gate_and_english_is_not():
    rows = [_row("non_english", "reference_not_read"), _row("non_english", error="no_speech"),
            _row("english_own", None, 0.8, language="en_US"),
            _row("english_other", "reference_not_read", 0.05, language="en_US")]
    result = ne.report(rows)

    assert result["passes"] is True
    assert result["kinds"]["non_english"] == {
        "pairs": 2, "below_gate": 2, "by_reason": {"no_speech": 1, "reference_not_read": 1},
        "coverage_corrected": {"min": 0.02, "median": 0.02, "max": 0.02}}
    assert result["non_english_by_language"]["zh_CN"]["below_gate"] == 2


def test_a_non_english_reading_scored_as_english_fails_it():
    rows = [_row("non_english", None, 0.14, language="fr_FR"),
            _row("english_own", None, 0.8, language="en_US")]
    result = ne.report(rows)

    assert result["passes"] is False
    assert [r["language"] for r in result["missed_non_english"]] == ["fr_FR"]


def test_an_unaligned_recording_counts_only_if_its_content_is_the_minimum():
    # Without alignment FastAPI leaves out Pronunciation and Oral Fluency
    # but still scores Content from the coverage.
    assert ne.below_gate(_row("non_english", "alignment_failed", 0.04)) is True
    assert ne.below_gate(_row("non_english", "alignment_failed", 0.2)) is False
