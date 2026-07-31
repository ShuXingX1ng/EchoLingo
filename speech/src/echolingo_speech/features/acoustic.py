"""Explicit interpretable acoustic features for the A0 sentence branch.

ADR-0011 SS5.2 / roadmap SS5.2 call for concatenating pause, speech-rate, pitch,
energy, and word-timing-stability evidence alongside the pooled encoder
representation so fluency/prosody judgements stay inspectable. This module
covers only the subset actually derivable from M1 artifacts (cached waveform +
MFA word spans): repetition/false-start/self-correction detection needs a
free-ASR-vs-reference diff, which is a runtime Speech Evidence component
(roadmap SS3) that does not exist yet and has no SpeechOcean762 ground truth to
train against -- that is a documented A0 scope boundary, not an oversight.

Called from `training/dataset.py` once per record at dataset construction time
(not per-epoch), using the same cached waveform `features/cache.py` already
wrote to disk in M1.
"""

from __future__ import annotations

import torch

from echolingo_speech.alignment.mfa import TextGridSpan

FEATURE_NAMES = (
    "pause_count",
    "pause_ratio",
    "longest_pause_sec",
    "speech_rate_wps",
    "word_duration_std_sec",
    "pitch_mean_hz",
    "pitch_std_hz",
    "energy_mean",
    "energy_std",
)

_MIN_PAUSE_SEC = 0.05
_ENERGY_FRAME_SEC = 0.025
_ENERGY_HOP_SEC = 0.010


def compute_acoustic_features(
    waveform: torch.Tensor,
    word_spans: list[TextGridSpan],
    *,
    duration_sec: float,
    reference_word_count: int,
    sample_rate: int = 16000,
) -> dict[str, float]:
    """`waveform` is mono `(1, num_samples)` at `sample_rate`, as produced by
    `features/cache.py::_load_waveform`. `word_spans` are the non-blank word
    tier intervals from `alignment.mfa.parse_textgrid_spans` (may be empty if
    the record's word alignment was masked invalid upstream -- callers still
    get a well-formed all-zero feature dict rather than a crash).
    """
    pause_count, pause_ratio, longest_pause = _pause_features(word_spans, duration_sec)
    word_duration_std = _word_duration_std(word_spans)
    speech_rate = reference_word_count / duration_sec if duration_sec > 0 else 0.0
    pitch_mean, pitch_std = _pitch_features(waveform, sample_rate)
    energy_mean, energy_std = _energy_features(waveform, sample_rate)

    return {
        "pause_count": pause_count,
        "pause_ratio": pause_ratio,
        "longest_pause_sec": longest_pause,
        "speech_rate_wps": speech_rate,
        "word_duration_std_sec": word_duration_std,
        "pitch_mean_hz": pitch_mean,
        "pitch_std_hz": pitch_std,
        "energy_mean": energy_mean,
        "energy_std": energy_std,
    }


def feature_vector(features: dict[str, float]) -> list[float]:
    """Fix a deterministic order for concatenation into the model input."""
    return [features[name] for name in FEATURE_NAMES]


def _pause_features(
    word_spans: list[TextGridSpan], duration_sec: float
) -> tuple[float, float, float]:
    """Only counts gaps *between* consecutive recognized words as pauses, not
    leading/trailing silence (that's recording padding, not a fluency signal),
    and ignores sub-50ms gaps as ordinary coarticulation rather than a pause.
    """
    if len(word_spans) < 2 or duration_sec <= 0:
        return 0.0, 0.0, 0.0

    gaps = [
        next_span.start - prev_span.end
        for prev_span, next_span in zip(word_spans, word_spans[1:])
    ]
    pauses = [gap for gap in gaps if gap >= _MIN_PAUSE_SEC]
    if not pauses:
        return 0.0, 0.0, 0.0
    return float(len(pauses)), sum(pauses) / duration_sec, max(pauses)


def _word_duration_std(word_spans: list[TextGridSpan]) -> float:
    if len(word_spans) < 2:
        return 0.0
    durations = torch.tensor([span.end - span.start for span in word_spans])
    return durations.std(unbiased=True).item()


def _pitch_features(waveform: torch.Tensor, sample_rate: int) -> tuple[float, float]:
    """`detect_pitch_frequency` has no voiced/unvoiced mask, so silent/unvoiced
    frames contribute a (clamped, low-confidence) estimate alongside voiced
    ones; acceptable as a first-baseline simplification, revisit if pitch
    proves too noisy a fluency/prosody signal once real training curves are in.
    """
    import torchaudio

    pitch = torchaudio.functional.detect_pitch_frequency(waveform, sample_rate)
    return pitch.mean().item(), pitch.std(unbiased=True).item()


def _energy_features(waveform: torch.Tensor, sample_rate: int) -> tuple[float, float]:
    frame_length = max(1, int(_ENERGY_FRAME_SEC * sample_rate))
    hop_length = max(1, int(_ENERGY_HOP_SEC * sample_rate))
    samples = waveform.squeeze(0)
    if samples.numel() < frame_length:
        return 0.0, 0.0

    frames = samples.unfold(0, frame_length, hop_length)
    rms = frames.pow(2).mean(dim=-1).sqrt()
    return rms.mean().item(), rms.std(unbiased=True).item()
