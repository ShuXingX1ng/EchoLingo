"""Single-utterance forced alignment for the Speech Evaluation Worker.

Training aligned the whole SpeechOcean corpus at once (`alignment/mfa.py`,
`mfa align`); the Worker aligns one recording per request with `mfa
align_one`, the same `english_us_arpa` acoustic model and dictionary. On
2026-10-25 the two gave the same words and phones with boundaries within
about 0.05 s on a validation utterance.

The recording and its transcript are written to a per-request temporary
directory that is always removed (roadmap SS10.4). MFA's own temporary root
only holds the models it extracts (about 100 MB), so it is kept across
requests in `model_cache_dir`: re-extracting them took a call from about 3 s
to 7.5 s.

`align_one` marks blanks `<eps>` (words) and `sil` (phones), and an
out-of-dictionary word `<unk>` with the single phone `spn`.
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import numpy as np
import soundfile as sf

from echolingo_speech.alignment.mfa import (
    ACOUSTIC_MODEL,
    CONDA_ENV,
    DICTIONARY,
    TextGridSpan,
    _resolve_mfa_invocation,
    parse_textgrid_spans,
)

BLANK_WORD_LABELS = frozenset({"<eps>"})
BLANK_PHONE_LABELS = frozenset({"sil", "sp", "silence"})
UNKNOWN_WORD_LABEL = "<unk>"
UNKNOWN_PHONE_LABEL = "spn"


class AlignmentError(RuntimeError):
    """The aligner produced no usable alignment for this recording."""


@dataclass(frozen=True)
class Alignment:
    """Ordered non-blank word and phone spans of one recording. An
    out-of-dictionary word keeps its `<unk>` label and its `spn` phone."""

    words: list[TextGridSpan] = field(default_factory=list)
    phones: list[TextGridSpan] = field(default_factory=list)


class Aligner(Protocol):
    name: str

    def version(self) -> str: ...

    def align(self, waveform: np.ndarray, sample_rate: int, text: str) -> Alignment: ...


def _without_blanks(spans: list[TextGridSpan], blanks: frozenset[str]) -> list[TextGridSpan]:
    return [span for span in spans if span.text not in blanks]


class MfaAligner:
    """`mfa align_one` in the `aligner` conda env (or `ECHOLINGO_MFA_BIN`)."""

    name = "montreal-forced-aligner"

    def __init__(
        self,
        model_cache_dir: Path,
        *,
        timeout_sec: float = 20.0,
        conda_env: str = CONDA_ENV,
        acoustic_model: str = ACOUSTIC_MODEL,
        dictionary: str = DICTIONARY,
    ) -> None:
        self.model_cache_dir = model_cache_dir
        self.timeout_sec = timeout_sec
        self.acoustic_model = acoustic_model
        self.dictionary = dictionary
        self._binary, self._env = _resolve_mfa_invocation(conda_env)

    def version(self) -> str:
        result = subprocess.run(
            [*self._binary, "version"], capture_output=True, text=True, env=self._env,
            timeout=self.timeout_sec, check=False,
        )
        if result.returncode != 0:
            raise AlignmentError(f"mfa version failed: {result.stderr.strip()[-500:]}")
        return result.stdout.strip()

    def align(self, waveform: np.ndarray, sample_rate: int, text: str) -> Alignment:
        """`waveform` is mono float in [-1, 1]; `text` is already normalized
        (`alignment.mfa.normalize_text`)."""
        self.model_cache_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="echolingo-align-") as work:
            work_dir = Path(work)
            audio_path = work_dir / "utterance.wav"
            text_path = work_dir / "utterance.lab"
            output_path = work_dir / "utterance.TextGrid"
            sf.write(str(audio_path), waveform, sample_rate, subtype="PCM_16")
            text_path.write_text(text + "\n", encoding="utf-8")
            command = [
                *self._binary, "align_one", "--quiet", "--overwrite",
                "--temporary_directory", str(self.model_cache_dir),
                str(audio_path), str(text_path), self.dictionary, self.acoustic_model,
                str(output_path),
            ]
            try:
                result = subprocess.run(
                    command, capture_output=True, text=True, env=self._env,
                    timeout=self.timeout_sec, check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise AlignmentError(f"mfa align_one exceeded {self.timeout_sec:g} s") from exc
            if result.returncode != 0 or not output_path.is_file():
                detail = (result.stderr or result.stdout).strip()[-500:]
                raise AlignmentError(f"mfa align_one failed ({result.returncode}): {detail}")
            words, phones = parse_textgrid_spans(output_path)
        return Alignment(
            words=_without_blanks(words, BLANK_WORD_LABELS),
            phones=_without_blanks(phones, BLANK_PHONE_LABELS),
        )
