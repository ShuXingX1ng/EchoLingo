"""M6 reading-error benchmark (`evaluation/reading_errors.py`)."""
from __future__ import annotations

import numpy as np

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.evaluation import reading_errors as re_eval
from echolingo_speech.worker.pipeline import AlignedWord
from echolingo_speech.worker.reading_errors import KindThresholds

RATE = 16000


def _word(start, end):
    return AlignedWord("w", TextGridSpan(start, end, "w"), [TextGridSpan(start, end, "AH0")], False)


def test_a_word_is_cut_out_between_the_midpoints_of_its_gaps():
    waveform = np.arange(2 * RATE, dtype=np.float32)
    words = [_word(0.2, 0.5), _word(0.7, 1.0), _word(1.2, 1.5)]
    cut = re_eval.without_word(waveform, words, 1)

    assert len(cut) == len(waveform) - int(0.5 * RATE)
    assert cut[int(0.6 * RATE)] == waveform[int(1.1 * RATE)]


def test_extra_audio_goes_midway_through_the_gap_framed_by_room_tone():
    waveform = np.concatenate([np.full(RATE // 2, 0.01), np.ones(RATE)]).astype(np.float32)
    words = [_word(0.5, 0.9), _word(1.1, 1.5)]
    clip = np.full(int(0.2 * RATE), 0.5, dtype=np.float32)
    out = re_eval.with_audio_after(waveform, words, 0, clip)

    margin = int(re_eval.INSERT_MARGIN_SEC * RATE)
    cut = RATE
    assert len(out) == len(waveform) + len(clip) + 2 * margin
    assert np.allclose(out[cut:cut + margin], 0.01)
    assert np.allclose(out[cut + margin:cut + margin + len(clip)], 0.5)


def _observed(spans, heard):
    return {"withheld": None, "frame_db": [],
            "words": [{"start": s, "end": e, "phones": 3, "oov": False, "accuracy": 9.0}
                      for s, e in spans],
            "recognized": [{"text": t, "start": s, "end": e} for t, s, e in heard]}


def _row(speaker, heard_original):
    spans = [(0.5, 0.7), (0.7, 1.1), (1.1, 1.5)]
    return {
        "sample_id": f"{speaker}-1", "speaker_id": speaker,
        "reference": ["the", "cat", "sat"],
        "original": _observed(spans, heard_original),
        "omit": None, "repeat": None,
        "insert": {"after_word": 0, "text": "big", "observed": _observed(
            spans, [("the", 0.5, 0.7), ("big", 0.8, 1.0), ("cat", 1.1, 1.3), ("sat", 1.3, 1.6)])},
    }


def test_precision_counts_reports_away_from_the_planted_change_as_false():
    clean = [("the", 0.5, 0.7), ("cat", 0.7, 1.1), ("sat", 1.1, 1.5)]
    noisy = [("the", 0.5, 0.7), ("cat", 0.7, 1.1), ("um", 1.1, 1.3), ("sat", 1.3, 1.5)]
    rows = [_row("1", clean), _row("2", noisy)]
    thresholds = KindThresholds(match_similarity=0.6, min_extra_sec=0.1, min_extra_letters=2,
                                repeat_similarity=0.7)
    scores = re_eval.score_kind("inserted", rows, thresholds)

    assert (scores["true"], scores["false"], scores["false_in_original"]) == (2, 1, 1)
    assert scores["precision"] == round(2 / 3, 4) and scores["recall"] == 1.0


def test_speakers_alternate_between_the_tuning_and_held_out_halves():
    rows = [{"speaker_id": s} for s in ("3", "1", "2", "1", "4")]
    tuning, held_out = re_eval.split_by_speaker(rows)

    assert {r["speaker_id"] for r in tuning} == {"1", "3"}
    assert {r["speaker_id"] for r in held_out} == {"2", "4"}
