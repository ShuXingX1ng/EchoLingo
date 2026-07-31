"""SpeechOcean762 scoring dataset for the A0 multi-task scorer.

Wires together M1 manifest records (`data/manifest.py`), cached Wav2Vec2 hidden
states and waveforms (`features/cache.py`), MFA word/phone spans
(`alignment/mfa.py`), label normalization + alignment-validity masks
(`training/labels.py`), and explicit acoustic features
(`features/acoustic.py`) into fixed-shape training examples. The encoder is
frozen (ADR-0011): this dataset only ever loads pre-computed `.npy` tensors,
never runs Wav2Vec2 itself.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

from echolingo_speech.alignment.mfa import TextGridSpan, parse_textgrid_spans
from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.features.acoustic import compute_acoustic_features, feature_vector
from echolingo_speech.training.labels import (
    SENTENCE_TARGET_KEYS,
    normalize_phone_accuracy,
    normalize_sentence_scores,
    normalize_word_score,
    phone_alignment_is_valid,
    word_alignment_is_valid,
)


@dataclass
class WordExample:
    frame_start: int
    frame_end: int
    accuracy: float
    stress: float


@dataclass
class PhoneExample:
    frame_start: int
    frame_end: int
    accuracy: float


@dataclass
class ScoringExample:
    sample_id: str
    hidden_states: torch.Tensor  # (T, 768), frozen Wav2Vec2 hidden states
    sentence_targets: torch.Tensor  # (4,), order = SENTENCE_TARGET_KEYS
    acoustic_features: torch.Tensor  # (len(FEATURE_NAMES),)
    word_examples: list[WordExample]
    phone_examples: list[PhoneExample]
    word_alignment_valid: bool


def _time_to_frame(t: float, duration_sec: float, num_frames: int) -> int:
    """Linear time->frame mapping (see M2 plan SS1): Wav2Vec2's conv stack has
    no exact closed-form frame count, so we map proportionally over the
    encoder's actual cached output length rather than assuming a fixed 50fps.
    """
    if duration_sec <= 0 or num_frames <= 0:
        return 0
    idx = int(t / duration_sec * num_frames)
    return max(0, min(num_frames - 1, idx))


def _span_to_frame_range(
    start: float, end: float, duration_sec: float, num_frames: int
) -> tuple[int, int]:
    frame_start = _time_to_frame(start, duration_sec, num_frames)
    frame_end = _time_to_frame(end, duration_sec, num_frames)
    if frame_end <= frame_start:
        frame_end = frame_start + 1
    return frame_start, min(frame_end, num_frames)


def _phones_for_word(
    word_span: TextGridSpan, phone_spans: list[TextGridSpan]
) -> list[TextGridSpan]:
    return [
        phone
        for phone in phone_spans
        if word_span.start <= (phone.start + phone.end) / 2 < word_span.end
    ]


def _match_words_and_phones(
    word_spans: list[TextGridSpan],
    phone_spans: list[TextGridSpan],
    canonical_words: list[dict],
    duration_sec: float,
    num_frames: int,
) -> tuple[list[WordExample], list[PhoneExample], bool]:
    """Zip MFA word spans against canonical (SpeechOcean-labelled) words by
    time order, and within each word, MFA phone spans against canonical phones
    by time order -- never by label, since MFA predicts actual pronunciation
    (e.g. `AA1`) while canonical phones are the reference. A record-level word
    count mismatch masks both word and phoneme supervision for the whole
    record; a per-word phone count mismatch masks only that word's phones.
    """
    if not word_alignment_is_valid(len(word_spans), len(canonical_words)):
        return [], [], False

    word_examples: list[WordExample] = []
    phone_examples: list[PhoneExample] = []
    for word_span, canonical_word in zip(word_spans, canonical_words):
        frame_start, frame_end = _span_to_frame_range(
            word_span.start, word_span.end, duration_sec, num_frames
        )
        normalized_word = normalize_word_score(canonical_word)
        word_examples.append(
            WordExample(
                frame_start, frame_end, normalized_word["accuracy"], normalized_word["stress"]
            )
        )

        canonical_phones = canonical_word["phones"]
        phones_accuracy = canonical_word["phones-accuracy"]
        mfa_phones_in_word = _phones_for_word(word_span, phone_spans)
        if not phone_alignment_is_valid(len(mfa_phones_in_word), len(canonical_phones)):
            continue
        for phone_span, raw_accuracy in zip(mfa_phones_in_word, phones_accuracy):
            phone_frame_start, phone_frame_end = _span_to_frame_range(
                phone_span.start, phone_span.end, duration_sec, num_frames
            )
            phone_examples.append(
                PhoneExample(
                    phone_frame_start, phone_frame_end, normalize_phone_accuracy(raw_accuracy)
                )
            )

    return word_examples, phone_examples, True


def _build_example(record: ManifestRecord, processed_root: Path) -> ScoringExample:
    feature_root = processed_root / "features"
    assert record.features is not None, f"{record.sample_id} has no cached features"

    hidden_states = torch.from_numpy(
        np.load(feature_root / record.features.wav2vec2_hidden_state_path)
    ).float()
    waveform = torch.from_numpy(np.load(feature_root / record.features.waveform_cache_path)).float()

    word_spans: list[TextGridSpan] = []
    phone_spans: list[TextGridSpan] = []
    if record.alignment is not None and record.alignment.textgrid_relative_path:
        textgrid_path = processed_root / record.alignment.textgrid_relative_path
        word_spans, phone_spans = parse_textgrid_spans(textgrid_path)

    canonical_words = record.scores["words"]
    num_frames = hidden_states.shape[0]
    duration_sec = record.audio.duration_sec

    word_examples, phone_examples, word_alignment_valid = _match_words_and_phones(
        word_spans, phone_spans, canonical_words, duration_sec, num_frames
    )

    sentence_normalized = normalize_sentence_scores(record.scores["sentence"])
    sentence_targets = torch.tensor(
        [sentence_normalized[key] for key in SENTENCE_TARGET_KEYS], dtype=torch.float32
    )

    acoustic = compute_acoustic_features(
        waveform,
        word_spans,
        duration_sec=duration_sec,
        reference_word_count=len(canonical_words),
    )
    acoustic_features = torch.tensor(feature_vector(acoustic), dtype=torch.float32)

    return ScoringExample(
        sample_id=record.sample_id,
        hidden_states=hidden_states,
        sentence_targets=sentence_targets,
        acoustic_features=acoustic_features,
        word_examples=word_examples,
        phone_examples=phone_examples,
        word_alignment_valid=word_alignment_valid,
    )


class SpeechOceanScoringDataset(Dataset):
    """One partition ("train" / "validation" / "test") of the M1 manifest,
    pre-materialized into `ScoringExample`s at construction time. The dataset
    is small enough (<=2500 records) that eager materialization is cheap and
    avoids re-parsing TextGrids and re-loading `.npy` files every epoch.
    """

    def __init__(self, manifest_path: Path, processed_root: Path, partition: str) -> None:
        records = [
            record for record in read_jsonl(manifest_path) if record.partition == partition
        ]
        self.examples = [_build_example(record, processed_root) for record in records]

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, index: int) -> ScoringExample:
        return self.examples[index]


def collate_fn(batch: list[ScoringExample]) -> dict:
    """Pads frames to the batch max length and keeps word/phone examples as
    plain per-sample lists, since span pooling in the model forward pass is
    inherently per-sample and this dataset is far too small for that to be a
    performance concern.
    """
    max_frames = max(example.hidden_states.shape[0] for example in batch)
    hidden_dim = batch[0].hidden_states.shape[1]

    padded_hidden_states = torch.zeros(len(batch), max_frames, hidden_dim, dtype=torch.float32)
    frame_mask = torch.zeros(len(batch), max_frames, dtype=torch.bool)
    for i, example in enumerate(batch):
        num_frames = example.hidden_states.shape[0]
        padded_hidden_states[i, :num_frames] = example.hidden_states
        frame_mask[i, :num_frames] = True

    return {
        "sample_ids": [example.sample_id for example in batch],
        "hidden_states": padded_hidden_states,
        "frame_mask": frame_mask,
        "sentence_targets": torch.stack([example.sentence_targets for example in batch]),
        "acoustic_features": torch.stack([example.acoustic_features for example in batch]),
        "word_examples": [example.word_examples for example in batch],
        "phone_examples": [example.phone_examples for example in batch],
        "word_alignment_valid": [example.word_alignment_valid for example in batch],
    }
