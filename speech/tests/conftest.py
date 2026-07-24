"""Shared pytest fixtures for the M1 SpeechOcean762 pipeline tests.

`speechocean_mini_corpus` builds a tiny synthetic (sine-tone) Kaldi-format corpus at
test time under `tmp_path` — never real corpus audio — so unit tests exercise the
real parsing/split/manifest code paths without downloading or committing any real
SpeechOcean762 data.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

SAMPLE_RATE = 16000

# (speaker_id, age_in_years, gender) x 2 utterances each = 8 train speakers / 16
# utterances. Ages match the real spk2age format (numeric years, not "adult"/"child"
# labels) so tests exercise the real age-group threshold logic in speechocean.py.
_TRAIN_SPEAKERS = [
    ("0001", 25, "m"),
    ("0002", 30, "m"),
    ("0003", 22, "f"),
    ("0004", 28, "f"),
    ("0005", 9, "m"),
    ("0006", 12, "m"),
    ("0007", 7, "f"),
    ("0008", 11, "f"),
]
_TEST_SPEAKERS = [
    ("0101", 24, "m"),
    ("0102", 10, "f"),
]


def _write_sine_wav(path: Path, *, duration_sec: float = 0.5, freq: float = 220.0) -> None:
    t = np.linspace(0, duration_sec, int(SAMPLE_RATE * duration_sec), endpoint=False)
    tone = 0.1 * np.sin(2 * np.pi * freq * t)
    sf.write(str(path), tone.astype(np.float32), SAMPLE_RATE)


def _build_split(corpus_dir: Path, split_name: str, speakers: list[tuple[str, int, str]]) -> None:
    split_dir = corpus_dir / split_name
    split_dir.mkdir(parents=True, exist_ok=True)
    wave_dir = corpus_dir / "WAVE"

    wav_scp_lines = []
    text_lines = []
    utt2spk_lines = []
    spk2gender_lines = []
    spk2age_lines = []

    for speaker_id, age_years, gender in speakers:
        speaker_wave_dir = wave_dir / f"SPEAKER{speaker_id}"
        speaker_wave_dir.mkdir(parents=True, exist_ok=True)
        spk2gender_lines.append(f"{speaker_id}\t{gender}")
        spk2age_lines.append(f"{speaker_id}\t{age_years}")

        for i in range(2):
            utt_id = f"{speaker_id}00{i}"
            wav_path = speaker_wave_dir / f"{utt_id}.WAV"
            _write_sine_wav(wav_path)
            rel_path = f"WAVE/SPEAKER{speaker_id}/{utt_id}.WAV"
            # Tab-delimited, matching the real speechocean762 release (not space).
            wav_scp_lines.append(f"{utt_id}\t{rel_path}")
            text_lines.append(f"{utt_id}\tTHE QUICK BROWN FOX")
            utt2spk_lines.append(f"{utt_id}\t{speaker_id}")

    (split_dir / "wav.scp").write_text("\n".join(wav_scp_lines) + "\n", encoding="utf-8")
    (split_dir / "text").write_text("\n".join(text_lines) + "\n", encoding="utf-8")
    (split_dir / "utt2spk").write_text("\n".join(utt2spk_lines) + "\n", encoding="utf-8")
    (split_dir / "spk2gender").write_text("\n".join(spk2gender_lines) + "\n", encoding="utf-8")
    (split_dir / "spk2age").write_text("\n".join(spk2age_lines) + "\n", encoding="utf-8")


@pytest.fixture
def speechocean_mini_corpus(tmp_path: Path) -> Path:
    corpus_dir = tmp_path / "speechocean762"
    corpus_dir.mkdir(parents=True, exist_ok=True)

    _build_split(corpus_dir, "train", _TRAIN_SPEAKERS)
    _build_split(corpus_dir, "test", _TEST_SPEAKERS)

    scores = {}
    for speakers in (_TRAIN_SPEAKERS, _TEST_SPEAKERS):
        for speaker_id, _age_group, _gender in speakers:
            for i in range(2):
                utt_id = f"{speaker_id}00{i}"
                scores[utt_id] = {
                    "accuracy": 8,
                    "completeness": 1.0,
                    "fluency": 7,
                    "prosodic": 7,
                    "total": 7,
                    "words": [
                        {"text": "the", "accuracy": 2, "stress": 1, "total": 2, "phones": []},
                    ],
                }
    (corpus_dir / "scores.json").write_text(json.dumps(scores), encoding="utf-8")
    return corpus_dir
