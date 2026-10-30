"""M6 fluency threshold selection (`evaluation/fluency_events.py`)."""
from __future__ import annotations

import numpy as np

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.evaluation import fluency_events as fe
from echolingo_speech.worker.pipeline import AlignedWord


def _word(start, end):
    return AlignedWord("w", TextGridSpan(start, end, "w"), [TextGridSpan(start, end, "AH0")], False)


def test_the_inserted_pause_is_room_tone_at_the_gap_midpoint():
    rate = 16000
    waveform = np.concatenate([np.full(rate // 2, 0.01), np.ones(rate)]).astype(np.float32)
    words = [_word(0.5, 0.9), _word(1.1, 1.5)]
    paused = fe.with_inserted_pause(waveform, words, after=0, length_sec=0.8)

    assert len(paused) == len(waveform) + int(0.8 * rate)
    cut = int(1.0 * rate)
    assert np.allclose(paused[cut:cut + int(0.8 * rate)], 0.01)  # the recording's own lead
    assert np.array_equal(paused[:cut], waveform[:cut])


def _spans(*pairs, phones=2):
    return [{"start": s, "end": e, "phones": phones, "oov": False} for s, e in pairs]


def _row(fluency, words, inserted=None):
    return {"sample_id": "x", "speaker_id": "1", "age_group": "adult", "fluency": fluency,
            "words": words, "inserted": inserted}


def test_the_report_picks_the_smallest_threshold_that_spares_fluent_readings():
    smooth = _spans((0.5, 0.8), (0.85, 1.1), (1.15, 1.4))
    # A fluent reader's 0.45 s pause: too many fluent readings below 0.5 s get events.
    natural = _spans((0.5, 0.8), (1.25, 1.5), (1.55, 1.8))
    halting = _spans((0.5, 0.8), (1.8, 2.1), (2.15, 2.4))
    rows = (
        [_row(10.0, smooth) for _ in range(18)] + [_row(9.0, natural) for _ in range(2)]
        + [_row(5.0, halting, {"after_word": 0, "length_sec": 0.8, "words": halting})]
    )
    result = fe.report(rows)

    by_pause = {entry["pause_sec"]: entry for entry in result["pause"]}
    assert by_pause[0.4]["fluent_rate"] == 0.1
    assert by_pause[0.5]["fluent_rate"] == 0.0
    assert by_pause[0.5]["disfluent_rate"] == 1.0
    assert by_pause[0.5]["inserted_recall_by_length_sec"]["0.8"] == 1.0
    assert by_pause[0.5]["inserted_recall_by_length_sec"]["0.3"] is None
    assert result["chosen"]["pause_sec"] == 0.5
    assert result["fluent_recordings"] == 20 and result["disfluent_recordings"] == 1
