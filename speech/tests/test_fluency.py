"""M6 fluency events from aligned word spans (`worker/fluency.py`)."""
from __future__ import annotations

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.worker.fluency import FluencyThresholds, fluency_events
from echolingo_speech.worker.pipeline import AlignedWord

THRESHOLDS = FluencyThresholds(
    pause_sec=0.5, boundary_pause_sec=1.5, slow_word_sec_per_phone=0.25, slow_word_min_sec=0.5
)


def _word(text, start, end, phones=2, out_of_vocabulary=False):
    step = (end - start) / max(phones, 1)
    spans = [TextGridSpan(start + i * step, start + (i + 1) * step, "AH0") for i in range(phones)]
    return AlignedWord(text, TextGridSpan(start, end, text), spans, out_of_vocabulary)


def _kinds(events):
    return [(e.kind, e.word_index, e.at_sentence_boundary) for e in events]


def test_fluent_reading_has_no_events():
    words = [_word("we", 0.5, 0.7), _word("call", 0.75, 1.0), _word("it", 1.05, 1.2)]
    assert fluency_events(words, None, THRESHOLDS) == []


def test_a_long_gap_inside_a_sentence_is_a_pause_after_its_word():
    words = [_word("we", 0.5, 0.7), _word("call", 1.3, 1.5), _word("it", 1.55, 1.7)]
    events = fluency_events(words, None, THRESHOLDS)
    assert _kinds(events) == [("pause", 0, False)]
    assert (events[0].start_sec, events[0].end_sec) == (0.7, 1.3)


def test_leading_and_trailing_silence_are_not_pauses():
    words = [_word("we", 3.0, 3.2), _word("call", 3.25, 3.5)]
    assert fluency_events(words, None, THRESHOLDS) == []


def test_a_sentence_boundary_needs_a_longer_gap():
    words = [_word("we", 0.0, 0.2), _word("call", 0.25, 0.5), _word("it", 0.55, 0.7),
             _word("bear", 1.7, 1.9), _word("now", 1.95, 2.1), _word("ok", 2.15, 2.3)]
    # A 1.0 s gap at the full stop is a natural pause, not an event.
    assert fluency_events(words, [3, 3], THRESHOLDS) == []
    words[3] = _word("bear", 2.4, 2.6)
    assert _kinds(fluency_events(words, [3, 3], THRESHOLDS)) == [("pause", 2, True)]
    # Counts that do not cover the words fall back to one sentence.
    assert _kinds(fluency_events(words, [2, 2], THRESHOLDS)) == [("pause", 2, False)]


def test_a_word_held_too_long_per_phone_is_slow():
    words = [_word("we", 0.0, 0.2), _word("call", 0.25, 1.25, phones=3), _word("it", 1.3, 1.4)]
    assert _kinds(fluency_events(words, None, THRESHOLDS)) == [("slow_word", 1, False)]


def test_a_short_word_is_never_slow_and_an_unknown_word_is_not_judged():
    words = [_word("a", 0.0, 0.45, phones=1),
             _word("zorblax", 0.5, 2.0, phones=0, out_of_vocabulary=True)]
    assert fluency_events(words, None, THRESHOLDS) == []
