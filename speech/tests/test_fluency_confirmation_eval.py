"""M6 confirmation of fluency events (`evaluation/fluency_confirmation.py`)."""
from __future__ import annotations

import numpy as np

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.evaluation import fluency_confirmation as fc
from echolingo_speech.worker.pipeline import AlignedWord


def test_the_stretched_word_is_drawn_out_and_the_rest_left_alone():
    rate = 16000
    waveform = np.random.default_rng(0).normal(0, 0.1, rate * 2).astype(np.float32)
    words = [AlignedWord("w", TextGridSpan(0.5, 1.0, "w"), [TextGridSpan(0.5, 1.0, "AH0")],
                         False)]
    out = fc.with_stretched_word(waveform, words, 0, factor=2.5)

    assert len(out) == len(waveform) + int(0.5 * rate * 1.5)
    assert np.array_equal(out[: rate // 2], waveform[: rate // 2])
    assert np.array_equal(out[-rate:], waveform[-rate:])


def _observed(spans, heard, phones=2):
    return {"words": [{"start": s, "end": e, "phones": phones, "oov": False} for s, e in spans],
            "recognized": [{"text": t, "start": s, "end": e} for t, s, e in heard]}


SMOOTH = [(0.5, 0.7), (0.75, 1.0), (1.05, 1.2)]
HEARD = [("we", 0.52, 0.66), ("call", 0.78, 0.95), ("it", 1.07, 1.15)]


def _row(speaker):
    paused = [(0.5, 0.7), (1.5, 1.75), (1.8, 1.95)]
    return {
        "sample_id": speaker, "speaker_id": speaker, "age_group": "adult", "fluency": 9.0,
        "reference": ["we", "call", "it"], "original": _observed(SMOOTH, HEARD),
        "paused": {"after_word": 0, "length_sec": 0.8, "observed": _observed(
            paused, [("we", 0.52, 0.66), ("call", 1.53, 1.7), ("it", 1.82, 1.9)])},
        "stretched": {"word": 1, "factor": 2.5, "observed": _observed(
            [(0.5, 0.7), (0.75, 1.6), (1.65, 1.8)],
            [("we", 0.52, 0.66), ("call", 0.9, 1.4), ("it", 1.67, 1.75)])},
    }


def _error_row(speaker):
    # "ladder" read between "we" and "call": the aligner stretches "we" over it.
    return {
        "sample_id": speaker, "speaker_id": speaker, "age_group": "adult",
        "reference": ["we", "call", "it"],
        "original": _observed(SMOOTH, HEARD),
        "omit": None, "repeat": None,
        "insert": {"after_word": 0, "observed": _observed(
            [(0.5, 1.3), (1.35, 1.6), (1.65, 1.8)],
            [("we", 0.52, 0.66), ("ladder", 0.8, 1.25), ("call", 1.38, 1.55),
             ("it", 1.67, 1.75)], phones=1)},
    }


def test_confirmation_keeps_the_planted_events_and_drops_the_invented_one():
    rows = [_row("1"), _row("2")]
    errors = [_error_row("1"), _error_row("2")]
    unconfirmed = fc.score(rows, errors, None)
    assert unconfirmed["invented_events"] == 2  # "we" drawn out, in both copies
    assert unconfirmed["planted_long_pause_found"] == 1.0
    assert unconfirmed["planted_slow_word_found"] == 1.0

    result = fc.report(rows, errors)
    assert result["chosen"] is not None
    held_out = result["held_out"]["all"]["confirmed"]
    assert held_out["invented_events"] == 0
    assert held_out["kept_long_pauses"] == 1.0 and held_out["kept_slow_words"] == 1.0
