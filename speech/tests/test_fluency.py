"""M6 fluency events from aligned word spans (`worker/fluency.py`)."""
from __future__ import annotations

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.worker.fluency import (
    ConfirmationThresholds,
    FluencyThresholds,
    confirmed,
    fluency_events,
)
from echolingo_speech.worker.pipeline import AlignedWord
from echolingo_speech.worker.reading_errors import RecognizedWord

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


CONFIRM = ConfirmationThresholds(match_similarity=0.7, anchor_tolerance_sec=0.1,
                                 pause_max_letters=1, slow_word_extra_letters=2)


def _heard(*items):
    return [RecognizedWord(text, start, end) for text, start, end in items]


def _confirmed(words, heard):
    return _kinds(confirmed(fluency_events(words, None, THRESHOLDS), words, heard, CONFIRM))


def test_a_pause_the_asr_heard_as_silence_is_kept():
    words = [_word("we", 0.5, 0.7), _word("call", 1.3, 1.5), _word("it", 1.55, 1.7)]
    heard = _heard(("we", 0.52, 0.66), ("u", 0.9, 0.92), ("call", 1.32, 1.46), ("it", 1.57, 1.65))
    assert _confirmed(words, heard) == [("pause", 0, False)]


def test_a_pause_beside_a_word_heard_elsewhere_is_dropped():
    # The aligner put "so" on a click at the start; the reader said it later.
    words = [_word("so", 0.51, 0.58), _word("of", 1.22, 1.47), _word("course", 1.47, 1.8)]
    heard = _heard(("so", 1.0, 1.18), ("of", 1.25, 1.4), ("course", 1.5, 1.75))
    assert _confirmed(words, heard) == []


def test_a_pause_with_a_word_heard_in_it_is_dropped():
    words = [_word("just", 0.5, 0.8), _word("want", 1.4, 1.7), _word("it", 1.75, 1.9)]
    heard = _heard(("just", 0.52, 0.75), ("ladder", 0.9, 1.3), ("want", 1.42, 1.65))
    assert _confirmed(words, heard) == []


def test_a_slow_word_holding_another_word_or_an_extra_one_is_dropped():
    # "want my" were pushed into "money" by a word read before them.
    words = [_word("want", 0.0, 0.3), _word("my", 0.3, 0.35), _word("money", 0.35, 1.5)]
    heard = _heard(("want", 0.6, 0.85), ("my", 0.9, 1.0), ("money", 1.1, 1.45))
    assert _confirmed(words, heard) == []
    # An inserted word swallowed by a short one.
    words = [_word("go", 0.0, 0.2), _word("to", 0.2, 1.0), _word("bed", 1.0, 1.3)]
    heard = _heard(("go", 0.02, 0.15), ("chocolate", 0.3, 0.8), ("bed", 1.05, 1.25))
    assert _confirmed(words, heard) == []


def test_a_slow_word_the_asr_misheard_is_kept():
    words = [_word("is", 0.0, 0.2), _word("now", 0.2, 0.9), _word("and", 0.95, 1.1)]
    heard = _heard(("is", 0.02, 0.15), ("ma", 0.4, 0.7), ("and", 0.97, 1.08))
    assert _confirmed(words, heard) == [("slow_word", 1, False)]
