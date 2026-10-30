"""The deterministic explanation layer (services/speech_explanation.py)."""

from models.schemas import SpeechEvaluationResult
from services.speech_explanation import (
    facts,
    feedback_context,
    practice_summary,
    with_practice_summary,
)

_WORDS = ["the", "heart", "pumps", "blood", "around", "the", "body", "every", "day"]


def _evaluation(statuses=None, scores=None, word_status="available", **fields):
    """An EchoLingo result over `_WORDS`; `statuses` and `scores` by index."""
    statuses, scores = statuses or {}, scores or {}
    words = [
        {"word": word, "status": statuses.get(i, "correct"), "score": scores.get(i, 80)}
        for i, word in enumerate(_WORDS)
    ]
    values = {
        "provider": "echolingo", "scale": "10-90", "pronunciation": 70, "oralFluency": 70,
        "content": 85, "words": words,
        "evidenceStatus": {"sentence": {"status": "available"},
                           "word": {"status": word_status}, "phoneme": {"status": word_status}},
        **fields,
    }
    return SpeechEvaluationResult.model_validate(values)


def _pause(after, start, end, boundary=False):
    return {"kind": "pause", "wordIndex": after, "startSec": start, "endSec": end,
            "atSentenceBoundary": boundary}


def _slow(index, start, end):
    return {"kind": "slow_word", "wordIndex": index, "startSec": start, "endSec": end}


def _inserted(after, heard):
    return {"kind": "inserted", "wordIndex": after, "startSec": 1.0, "endSec": 1.4, "heard": heard}


def _items(result):
    return [(item.kind, item.wordIndices, item.words) for item in practice_summary(result)]


def test_facts_merge_word_statuses_reading_errors_and_fluency_events_in_reading_order():
    result = _evaluation(
        statuses={1: "mispronounced", 6: "omitted"}, scores={1: 35},
        readingErrors=[_inserted(3, "big"),
                       {"kind": "omitted", "wordIndex": 6, "startSec": 2.0, "endSec": 2.03}],
        fluencyEvents=[_pause(4, 1.8, 2.6)],
    )
    assert [(f.kind, f.index, f.shown) for f in facts(result)] == [
        ("mispronounced", 1, "heart"), ("inserted", 3, "big"), ("pause", 4, "around"),
        ("omitted", 6, "body"),  # once, though both the status and the error say so
    ]
    assert facts(result)[2].seconds == 0.8


def test_reading_errors_come_first_then_the_lower_scored_dimension():
    errors = {"statuses": {1: "mispronounced"}, "readingErrors": [_inserted(3, "big")],
              "fluencyEvents": [_pause(4, 1.8, 2.6)]}

    assert [kind for kind, _, _ in _items(_evaluation(**errors, oralFluency=50))] == [
        "inserted", "pause", "mispronounced"]
    assert [kind for kind, _, _ in _items(_evaluation(**errors, pronunciation=50))] == [
        "inserted", "mispronounced", "pause"]
    # A tie, or a dimension without a score, puts pronunciation first.
    assert [kind for kind, _, _ in _items(_evaluation(**errors, oralFluency=None))] == [
        "inserted", "mispronounced", "pause"]


def test_at_most_three_items_of_five_words_the_worst_shown_in_reading_order():
    result = _evaluation(
        statuses={i: "mispronounced" for i in range(7)},
        scores={0: 50, 1: 20, 2: 60, 3: 30, 4: 10, 5: 70, 6: 40},
        readingErrors=[_inserted(7, "big")],
        fluencyEvents=[_pause(0, 0.3, 0.8), _pause(2, 1.0, 2.2), _slow(8, 3.0, 3.9)],
    )
    summary = practice_summary(result)

    assert [item.kind for item in summary] == ["inserted", "mispronounced", "pause"]
    mispronounced = summary[1]
    assert mispronounced.count == 7
    assert mispronounced.wordIndices == [0, 1, 3, 4, 6]
    assert mispronounced.words == ["the", "heart", "blood", "around", "body"]


def test_an_inserted_word_is_named_as_heard_and_a_pause_by_the_word_before_it():
    result = _evaluation(readingErrors=[_inserted(1, "big")], fluencyEvents=[_pause(5, 2.0, 2.9)])
    assert _items(result) == [("inserted", [1], ["big"]), ("pause", [5], ["the"])]


def test_without_word_evidence_there_is_nothing_to_practise():
    result = _evaluation(statuses={1: "mispronounced"}, word_status="unavailable")
    assert practice_summary(result) == []
    assert "No word-level judgments are available" in feedback_context(result)


def test_with_practice_summary_fills_the_result_and_keeps_the_rest():
    result = _evaluation(statuses={1: "mispronounced"})
    filled = with_practice_summary(result)

    assert [item.kind for item in filled.practiceSummary] == ["mispronounced"]
    assert filled.model_dump(exclude={"practiceSummary"}) == result.model_dump(
        exclude={"practiceSummary"})
    assert with_practice_summary(None) is None


def test_the_feedback_context_states_each_fact_the_practice_order_and_the_rules():
    result = with_practice_summary(_evaluation(
        statuses={1: "mispronounced", 8: "not_scored"}, scores={1: 35},
        readingErrors=[_inserted(3, "big"),
                       {"kind": "repeated", "wordIndex": 6, "startSec": 2.0, "endSec": 2.3,
                        "heard": "bod"}],
        fluencyEvents=[_pause(4, 1.8, 2.6, boundary=True), _slow(7, 2.6, 3.4)],
    ))
    ctx = feedback_context(result)

    assert "Pronunciation: 70, Oral fluency: 70, Content: 85" in ctx
    assert "not an official PTE score" in ctx
    for line in ('- "heart" mispronounced (word score 35)',
                 '- "big" added after "blood"',
                 '- pause of 0.8 s between sentences, after "around"',
                 '- "body" said again (heard "bod")',
                 '- "every" drawn out (0.8 s)'):
        assert line in ctx
    assert 'Words not judged: "day"' in ctx
    assert ('Practise first, in this order: words added: "big"; words said again: "body"; '
            'mispronounced words: "heart"') in ctx
    assert "Do not change them" in ctx
    assert "do not say the reading had none" in ctx


def test_a_clean_reading_is_stated_as_such():
    ctx = feedback_context(_evaluation())
    assert "nothing: every scored word was judged correct and no pause" in ctx
    assert "Practise first" not in ctx
