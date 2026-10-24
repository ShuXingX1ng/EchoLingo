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

from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

from echolingo_speech.alignment.mfa import TextGridSpan, parse_textgrid_spans
from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.features.acoustic import compute_acoustic_features, feature_vector
from echolingo_speech.features.cache import layer_cache_dir_name, variant_feature_root
from echolingo_speech.training.labels import (
    SENTENCE_TARGET_KEYS,
    canonical_phone_id,
    normalize_phone_accuracy,
    normalize_sentence_scores,
    normalize_word_score,
    phone_alignment_is_valid,
    rater_phone_targets,
    rater_sentence_targets,
    rater_word_targets,
    word_alignment_is_valid,
)


@dataclass
class WordExample:
    frame_start: int
    frame_end: int
    accuracy: float
    stress: float
    # Canonical (expected) phone ids of the word, from `canonical_phone_id`.
    phone_ids: list[int] = field(default_factory=list)
    # Std of the five experts' accuracy on [0, 1]; None without rater scores.
    accuracy_spread: float | None = None


@dataclass
class PhoneExample:
    frame_start: int
    frame_end: int
    accuracy: float
    # Canonical (expected) phone id at this position, from `canonical_phone_id`.
    phone_id: int = 0
    # Std of the five experts' accuracy on [0, 1]; None without rater scores.
    accuracy_spread: float | None = None


@dataclass
class ScoringExample:
    sample_id: str
    # (T, 768) last layer, or (L, T, 768) fp16 for a multi-layer cache
    hidden_states: torch.Tensor
    sentence_targets: torch.Tensor  # (4,), order = SENTENCE_TARGET_KEYS
    acoustic_features: torch.Tensor  # (len(FEATURE_NAMES),)
    word_examples: list[WordExample]
    phone_examples: list[PhoneExample]
    word_alignment_valid: bool
    # (4,) std of the five experts per sentence target; None without rater scores.
    sentence_spread: torch.Tensor | None = None


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
    *,
    rater_words: list[dict] | None = None,
    rater_targets: bool = False,
) -> tuple[list[WordExample], list[PhoneExample], bool]:
    """Zip MFA word spans against canonical (SpeechOcean-labelled) words by
    time order, and within each word, MFA phone spans against canonical phones
    by time order -- never by label, since MFA predicts actual pronunciation
    (e.g. `AA1`) while canonical phones are the reference. A record-level word
    count mismatch masks both word and phoneme supervision for the whole
    record; a per-word phone count mismatch masks only that word's phones.

    `rater_words` (the record's `scores["raters"]["words"]`) adds each
    example's expert spread; with `rater_targets` the accuracy and stress
    targets also become the expert mean instead of the official aggregate.
    """
    if rater_targets and rater_words is None:
        raise ValueError("rater_targets needs the record's rater scores")
    if not word_alignment_is_valid(len(word_spans), len(canonical_words)):
        return [], [], False

    word_examples: list[WordExample] = []
    phone_examples: list[PhoneExample] = []
    for index, (word_span, canonical_word) in enumerate(zip(word_spans, canonical_words)):
        frame_start, frame_end = _span_to_frame_range(
            word_span.start, word_span.end, duration_sec, num_frames
        )
        normalized_word = normalize_word_score(canonical_word)
        canonical_phones = canonical_word["phones"]
        phone_targets = [normalize_phone_accuracy(raw) for raw in canonical_word["phones-accuracy"]]
        phone_spreads: list[float | None] = [None] * len(canonical_phones)
        word_spread = None
        if rater_words is not None:
            rater_word = rater_words[index]
            word_raters = rater_word_targets(rater_word)
            word_spread = word_raters["accuracy_spread"]
            phone_raters = [rater_phone_targets(scores) for scores in rater_word["phones-accuracy"]]
            phone_spreads = [spread for _, spread in phone_raters]
            if rater_targets:
                normalized_word = word_raters
                phone_targets = [mean for mean, _ in phone_raters]
        word_examples.append(
            WordExample(
                frame_start,
                frame_end,
                normalized_word["accuracy"],
                normalized_word["stress"],
                [canonical_phone_id(phone) for phone in canonical_phones],
                word_spread,
            )
        )

        mfa_phones_in_word = _phones_for_word(word_span, phone_spans)
        if not phone_alignment_is_valid(len(mfa_phones_in_word), len(canonical_phones)):
            continue
        for phone_span, target, spread, canonical_phone in zip(
            mfa_phones_in_word, phone_targets, phone_spreads, canonical_phones
        ):
            phone_frame_start, phone_frame_end = _span_to_frame_range(
                phone_span.start, phone_span.end, duration_sec, num_frames
            )
            phone_examples.append(
                PhoneExample(
                    phone_frame_start,
                    phone_frame_end,
                    target,
                    canonical_phone_id(canonical_phone),
                    spread,
                )
            )

    return word_examples, phone_examples, True


def _record_spans(
    record: ManifestRecord, processed_root: Path
) -> tuple[list[TextGridSpan], list[TextGridSpan]]:
    """The record's MFA word and phone spans; empty without an alignment."""
    if record.alignment is None or not record.alignment.textgrid_relative_path:
        return [], []
    return parse_textgrid_spans(processed_root / record.alignment.textgrid_relative_path)


def _acoustic_feature_tensor(
    record: ManifestRecord, waveform: torch.Tensor, word_spans: list[TextGridSpan]
) -> torch.Tensor:
    acoustic = compute_acoustic_features(
        waveform,
        word_spans,
        duration_sec=record.audio.duration_sec,
        reference_word_count=len(record.scores["words"]),
    )
    return torch.tensor(feature_vector(acoustic), dtype=torch.float32)


def _build_example(
    record: ManifestRecord,
    processed_root: Path,
    hidden_state_layers: tuple[int, ...] | None = None,
    rater_targets: bool = False,
    feature_variant: str | None = None,
    encoder_input_normalized: bool = False,
) -> ScoringExample:
    feature_root = processed_root / "features"
    assert record.features is not None, f"{record.sample_id} has no cached features"
    if feature_variant is not None:
        # An augmented copy of the audio (`features/augment.py`): only its
        # waveform and layer cache differ, the TextGrid and labels are the
        # clean ones.
        if not hidden_state_layers:
            raise ValueError("feature variants are only cached for hidden_state_layers")
        feature_root = variant_feature_root(feature_root, feature_variant)
    if encoder_input_normalized and not hidden_state_layers:
        raise ValueError("a normalized-input cache exists only for hidden_state_layers")

    if hidden_state_layers:
        # Kept fp16 in memory (5 layers x 2500 records would not fit as fp32
        # alongside the other partitions); `collate_fn` casts each batch.
        layer_dir = layer_cache_dir_name(
            record.features.encoder_revision, hidden_state_layers, encoder_input_normalized
        )
        hidden_states = torch.from_numpy(
            np.load(feature_root / layer_dir / f"{record.sample_id}.npy")
        )
    else:
        hidden_states = torch.from_numpy(
            np.load(feature_root / record.features.wav2vec2_hidden_state_path)
        ).float()
    waveform = torch.from_numpy(np.load(feature_root / record.features.waveform_cache_path)).float()

    word_spans, phone_spans = _record_spans(record, processed_root)

    canonical_words = record.scores["words"]
    num_frames = hidden_states.shape[-2]
    duration_sec = record.audio.duration_sec
    raters = record.scores.get("raters")
    if rater_targets and raters is None:
        raise ValueError(
            f"{record.sample_id} has no rater scores; run "
            "`python -m echolingo_speech.data.speechocean attach-raters` on the manifest"
        )

    word_examples, phone_examples, word_alignment_valid = _match_words_and_phones(
        word_spans,
        phone_spans,
        canonical_words,
        duration_sec,
        num_frames,
        rater_words=raters["words"] if raters is not None else None,
        rater_targets=rater_targets,
    )

    sentence_normalized = normalize_sentence_scores(record.scores["sentence"])
    sentence_spread = None
    if raters is not None:
        sentence_centers, sentence_spreads = rater_sentence_targets(raters["sentence"])
        sentence_spread = torch.tensor(
            [sentence_spreads[key] for key in SENTENCE_TARGET_KEYS], dtype=torch.float32
        )
        if rater_targets:
            sentence_normalized = sentence_centers
    sentence_targets = torch.tensor(
        [sentence_normalized[key] for key in SENTENCE_TARGET_KEYS], dtype=torch.float32
    )

    acoustic_features = _acoustic_feature_tensor(record, waveform, word_spans)

    return ScoringExample(
        sample_id=record.sample_id,
        hidden_states=hidden_states,
        sentence_targets=sentence_targets,
        acoustic_features=acoustic_features,
        word_examples=word_examples,
        phone_examples=phone_examples,
        word_alignment_valid=word_alignment_valid,
        sentence_spread=sentence_spread,
    )


class SpeechOceanScoringDataset(Dataset):
    """One partition ("train" / "validation" / "test") of the M1 manifest,
    pre-materialized into `ScoringExample`s at construction time. The dataset
    is small enough (<=2500 records) that eager materialization is cheap and
    avoids re-parsing TextGrids and re-loading `.npy` files every epoch.

    `rater_targets` swaps the official aggregate targets for the five
    experts' mean; it is meant for the training partition only, so that
    validation and test keep scoring against the official labels.
    """

    def __init__(
        self,
        manifest_path: Path,
        processed_root: Path,
        partition: str,
        hidden_state_layers: tuple[int, ...] | list[int] | None = None,
        rater_targets: bool = False,
        feature_variant: str | None = None,
        age_groups: list[str] | None = None,
        encoder_input_normalized: bool = False,
    ) -> None:
        self.records = [
            record
            for record in read_jsonl(manifest_path)
            if record.partition == partition
            and (age_groups is None or record.speaker_age_group in age_groups)
        ]
        if not self.records:
            raise ValueError(f"no {partition} records for age groups {age_groups}")
        layers = tuple(hidden_state_layers) if hidden_state_layers else None
        self.examples = [
            _build_example(
                record, processed_root, layers, rater_targets, feature_variant,
                encoder_input_normalized,
            )
            for record in self.records
        ]

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, index: int) -> ScoringExample:
        return self.examples[index]


class AugmentedTrainingDataset(Dataset):
    """The training partition with augmented copies of its audio (M3 A0-Aug,
    `features/augment.py`). Each item is an augmented copy with probability
    `augmentation_prob` (the copy drawn uniformly), else the clean example,
    drawn afresh every time it is fetched, so every epoch sees a new mix.

    A copy shares the clean example's spans and targets (the augmentation
    keeps every waveform's length); only its hidden states and explicit
    acoustic features differ. The acoustic features are computed up front;
    the copies' hidden states are read from disk per item, since holding
    several fp16 copies of the training cache in memory would not fit.
    """

    def __init__(
        self,
        clean: SpeechOceanScoringDataset,
        processed_root: Path,
        hidden_state_layers: tuple[int, ...] | list[int],
        variants: list[str],
        augmentation_prob: float,
        encoder_input_normalized: bool = False,
    ) -> None:
        if not variants:
            raise ValueError("AugmentedTrainingDataset needs at least one variant")
        self.clean = clean
        self.augmentation_prob = augmentation_prob
        feature_root = processed_root / "features"
        self.hidden_state_paths: list[list[Path]] = []
        self.acoustic_features: list[list[torch.Tensor]] = []
        for variant in variants:
            root = variant_feature_root(feature_root, variant)
            paths, acoustic = [], []
            for record in clean.records:
                assert record.features is not None, f"{record.sample_id} has no cached features"
                layer_dir = layer_cache_dir_name(
                    record.features.encoder_revision,
                    tuple(hidden_state_layers),
                    encoder_input_normalized,
                )
                path = root / layer_dir / f"{record.sample_id}.npy"
                if not path.is_file():
                    raise FileNotFoundError(
                        f"{path} is missing; run `python -m echolingo_speech.features.augment`"
                    )
                paths.append(path)
                waveform = torch.from_numpy(
                    np.load(root / record.features.waveform_cache_path)
                ).float()
                word_spans, _ = _record_spans(record, processed_root)
                acoustic.append(_acoustic_feature_tensor(record, waveform, word_spans))
            self.hidden_state_paths.append(paths)
            self.acoustic_features.append(acoustic)

    def __len__(self) -> int:
        return len(self.clean)

    def __getitem__(self, index: int) -> ScoringExample:
        example = self.clean[index]
        if torch.rand(()).item() >= self.augmentation_prob:
            return example
        copy = int(torch.randint(len(self.hidden_state_paths), ()).item())
        hidden_states = torch.from_numpy(np.load(self.hidden_state_paths[copy][index]))
        if hidden_states.shape != example.hidden_states.shape:
            raise ValueError(
                f"{example.sample_id}: augmented copy has shape {tuple(hidden_states.shape)}, "
                f"clean has {tuple(example.hidden_states.shape)}"
            )
        return replace(
            example,
            hidden_states=hidden_states,
            acoustic_features=self.acoustic_features[copy][index],
        )


def collate_fn(batch: list[ScoringExample]) -> dict:
    """Pads frames to the batch max length and keeps word/phone examples as
    plain per-sample lists, since span pooling in the model forward pass is
    inherently per-sample and this dataset is far too small for that to be a
    performance concern.
    """
    max_frames = max(example.hidden_states.shape[-2] for example in batch)
    # (T, H) single layer -> (B, T, H); (L, T, H) multi-layer -> (B, L, T, H)
    leading = tuple(batch[0].hidden_states.shape[:-2])
    hidden_dim = batch[0].hidden_states.shape[-1]

    padded_hidden_states = torch.zeros(
        (len(batch), *leading, max_frames, hidden_dim), dtype=torch.float32
    )
    frame_mask = torch.zeros(len(batch), max_frames, dtype=torch.bool)
    for i, example in enumerate(batch):
        num_frames = example.hidden_states.shape[-2]
        padded_hidden_states[i, ..., :num_frames, :] = example.hidden_states.float()
        frame_mask[i, :num_frames] = True

    spreads = [example.sentence_spread for example in batch]
    return {
        "sample_ids": [example.sample_id for example in batch],
        "hidden_states": padded_hidden_states,
        "frame_mask": frame_mask,
        "sentence_targets": torch.stack([example.sentence_targets for example in batch]),
        "acoustic_features": torch.stack([example.acoustic_features for example in batch]),
        "word_examples": [example.word_examples for example in batch],
        "phone_examples": [example.phone_examples for example in batch],
        "word_alignment_valid": [example.word_alignment_valid for example in batch],
        # (B, 4), or None unless every record in the batch has rater scores
        "sentence_spread": (
            torch.stack(spreads) if all(spread is not None for spread in spreads) else None
        ),
    }
