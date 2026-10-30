"""M6 omitted, inserted and repeated words (`worker/reading_errors.py`)."""
from __future__ import annotations

import pytest

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.encoder.loquacious import CharVocab
from echolingo_speech.worker.pipeline import AlignedWord
from echolingo_speech.worker.reading_errors import (
    KindThresholds,
    ReadingErrorThresholds,
    RecognizedWord,
    anchors,
    detect,
    reading_errors,
    recognized_words,
)

VOCAB = CharVocab({"<pad>": 0, "<s>": 1, "</s>": 2, "<unk>": 3, "|": 4,
                   **{c: 5 + i for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ'")}})


def _ids(frames: str) -> list[int]:
    """One frame per character: `_` is the blank, a space the delimiter."""
    return [0 if c == "_" else 4 if c == " " else VOCAB.token_to_id[c] for c in frames]


def test_recognized_words_carry_the_frames_the_ctc_head_emitted_them_in():
    ids = _ids("__WW_E__ CAA_L_L_ ___")
    words = recognized_words(ids, VOCAB, frame_sec=0.02)

    assert " ".join(w.text for w in words) == VOCAB.decode_greedy(ids).lower() == "we call"
    assert [(w.start_sec, w.end_sec) for w in words] == pytest.approx(
        [(0.04, 0.12), (0.18, 0.32)])


def _words(*items):
    """(text, start, end, phones) reference words as aligned."""
    return [AlignedWord(t, TextGridSpan(s, e, t), [TextGridSpan(s, e, "AH0")] * n, False)
            for t, s, e, n in items]


def _heard(*items):
    return [RecognizedWord(t, s, e) for t, s, e in items]


CAT_SAT_DOWN = _words(("the", 0.5, 0.7, 2), ("cat", 0.7, 1.1, 3), ("sat", 1.1, 1.5, 3),
                      ("down", 1.5, 2.0, 3))
# "cat" squeezed into 90 ms, as the aligner does to a word that is not there.
SQUEEZED_CAT = _words(("the", 0.5, 0.7, 2), ("cat", 0.7, 0.79, 3), ("sat", 0.79, 1.2, 3),
                      ("down", 1.2, 1.7, 3))
OMIT = KindThresholds(match_similarity=0.6, max_sec_per_phone=0.04)
EXTRA = KindThresholds(match_similarity=0.6, min_extra_sec=0.1, min_extra_letters=2,
                       repeat_similarity=0.7)


def test_anchors_keep_only_confident_matches_in_order():
    assert anchors(["the", "cat", "sat"], ["de", "cat", "sat", "cat"], 0.6) == [(1, 1), (2, 2)]


def test_a_word_squeezed_by_the_aligner_and_not_heard_is_omitted():
    heard = _heard(("the", 0.5, 0.7), ("sat", 0.8, 1.2), ("down", 1.2, 1.7))
    errors = detect("omitted", SQUEEZED_CAT, heard, OMIT)

    assert [(e.kind, e.word_index, e.start_sec) for e in errors] == [("omitted", 1, 0.7)]


def test_an_unheard_word_of_normal_length_is_not_omitted():
    heard = _heard(("the", 0.5, 0.7), ("sat", 1.1, 1.5), ("down", 1.5, 2.0))
    assert detect("omitted", CAT_SAT_DOWN, heard, OMIT) == []


def test_a_word_heard_as_something_else_is_neither_omitted_nor_inserted():
    heard = _heard(("the", 0.5, 0.7), ("dog", 0.7, 0.8), ("sat", 0.8, 1.2), ("down", 1.2, 1.7))
    for kind in ("omitted", "inserted", "repeated"):
        assert detect(kind, SQUEEZED_CAT, heard, OMIT if kind == "omitted" else EXTRA) == []


def test_an_extra_word_between_two_heard_words_is_inserted():
    heard = _heard(("the", 0.5, 0.7), ("cat", 0.7, 1.1), ("big", 1.2, 1.4), ("sat", 1.5, 1.8),
                   ("down", 1.8, 2.2))
    errors = detect("inserted", CAT_SAT_DOWN, heard, EXTRA)

    assert [(e.kind, e.word_index, e.heard) for e in errors] == [("inserted", 1, "big")]
    assert detect("repeated", CAT_SAT_DOWN, heard, EXTRA) == []


def test_an_extra_word_like_its_neighbour_is_repeated_even_before_the_first_word():
    heard = _heard(("the", 0.5, 0.7), ("cat", 0.7, 1.1), ("cats", 1.2, 1.5), ("sat", 1.5, 1.8),
                   ("down", 1.8, 2.2))
    errors = detect("repeated", CAT_SAT_DOWN, heard, EXTRA)
    assert [(e.kind, e.word_index, e.heard) for e in errors] == [("repeated", 1, "cats")]
    assert detect("inserted", CAT_SAT_DOWN, heard, EXTRA) == []

    leading = _heard(("thee", 0.1, 0.4), ("the", 0.5, 0.7), ("cat", 0.7, 1.1),
                     ("sat", 1.1, 1.5), ("down", 1.5, 2.0))
    assert [e.word_index for e in detect("repeated", CAT_SAT_DOWN, leading, EXTRA)] == [0]


def test_stray_letters_and_speech_outside_the_reference_are_not_errors():
    stray = _heard(("the", 0.5, 0.7), ("cat", 0.7, 1.1), ("a", 1.1, 1.12), ("sat", 1.1, 1.5),
                   ("down", 1.5, 2.0))
    trailing = _heard(("the", 0.5, 0.7), ("cat", 0.7, 1.1), ("sat", 1.1, 1.5),
                      ("down", 1.5, 2.0), ("okay", 2.2, 2.6))
    for heard in (stray, trailing):
        assert detect("inserted", CAT_SAT_DOWN, heard, EXTRA) == []


def test_a_kind_without_thresholds_is_never_reported():
    heard = _heard(("the", 0.5, 0.7), ("cat", 0.7, 1.1), ("big", 1.2, 1.4), ("sat", 1.5, 1.8),
                   ("down", 1.8, 2.2))
    off = ReadingErrorThresholds(by_kind={"inserted": None})
    assert reading_errors(CAT_SAT_DOWN, heard, off) == []
    on = ReadingErrorThresholds(by_kind={"inserted": EXTRA})
    assert [e.kind for e in reading_errors(CAT_SAT_DOWN, heard, on)] == ["inserted"]


def test_a_word_heard_in_two_is_not_an_extra_word():
    words = _words(("however", 0.5, 1.0, 5), ("that", 1.0, 1.3, 3), ("was", 1.3, 1.6, 3))
    heard = _heard(("how", 0.5, 0.7), ("ever", 0.75, 1.0), ("that", 1.0, 1.3),
                   ("was", 1.3, 1.6))
    for kind in ("inserted", "repeated"):
        assert detect(kind, words, heard, EXTRA) == []


def test_a_word_with_fewer_phones_than_the_minimum_is_never_omitted():
    words = _words(("it", 0.5, 0.7, 2), ("a", 0.7, 0.73, 1), ("cat", 0.73, 1.1, 3))
    heard = _heard(("it", 0.5, 0.7), ("cat", 0.73, 1.1))
    assert [e.word_index for e in detect("omitted", words, heard, OMIT)] == [1]
    strict = KindThresholds(match_similarity=0.6, max_sec_per_phone=0.04, min_phones=2)
    assert detect("omitted", words, heard, strict) == []


def test_only_kinds_that_met_the_benchmark_are_reported_by_default():
    from echolingo_speech.worker.reading_errors import DEFAULT_THRESHOLDS

    reported = {k for k, v in DEFAULT_THRESHOLDS.by_kind.items() if v is not None}
    assert reported == {"inserted"}
