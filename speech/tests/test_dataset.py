"""SpeechOceanScoringDataset / collate_fn tests against a tiny synthetic
manifest + cached .npy files + hand-written TextGrids under tmp_path (never
real corpus data)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import torch

from echolingo_speech.alignment.mfa import TextGridSpan
from echolingo_speech.data.manifest import (
    AlignmentInfo,
    AudioInfo,
    DerivationInfo,
    FeatureInfo,
    ManifestRecord,
    SourceInfo,
    write_jsonl,
)
from echolingo_speech.training.dataset import (
    SpeechOceanScoringDataset,
    _match_words_and_phones,
    _span_to_frame_range,
    _time_to_frame,
    collate_fn,
)
from echolingo_speech.training.labels import canonical_phone_id

_TEXTGRID_TEMPLATE = """File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = {duration}
tiers? <exists>
size = 2
item []:
    item [1]:
        class = "IntervalTier"
        name = "words"
        xmin = 0
        xmax = {duration}
        intervals: size = {word_interval_count}
{word_intervals}
    item [2]:
        class = "IntervalTier"
        name = "phones"
        xmin = 0
        xmax = {duration}
        intervals: size = {phone_interval_count}
{phone_intervals}
"""


def _interval(index: int, start: float, end: float, text: str) -> str:
    return (
        f"        intervals [{index}]:\n"
        f"            xmin = {start}\n"
        f"            xmax = {end}\n"
        f'            text = "{text}"\n'
    )


def _write_textgrid(
    path: Path,
    *,
    duration: float,
    words: list[tuple[float, float, str]],
    phones: list[tuple[float, float, str]],
) -> None:
    word_text = "".join(
        _interval(i + 1, start, end, text) for i, (start, end, text) in enumerate(words)
    )
    phone_text = "".join(
        _interval(i + 1, start, end, text) for i, (start, end, text) in enumerate(phones)
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        _TEXTGRID_TEMPLATE.format(
            duration=duration,
            word_interval_count=len(words),
            word_intervals=word_text,
            phone_interval_count=len(phones),
            phone_intervals=phone_text,
        ),
        encoding="utf-8",
    )


def test_time_to_frame_clips_to_valid_range():
    assert _time_to_frame(-1.0, duration_sec=2.0, num_frames=100) == 0
    assert _time_to_frame(0.0, duration_sec=2.0, num_frames=100) == 0
    assert _time_to_frame(1.0, duration_sec=2.0, num_frames=100) == 50
    assert _time_to_frame(2.0, duration_sec=2.0, num_frames=100) == 99


def test_span_to_frame_range_never_returns_an_empty_span():
    # A span shorter than one frame's worth of time should still yield >=1 frame.
    start, end = _span_to_frame_range(1.0, 1.001, duration_sec=2.0, num_frames=100)
    assert end > start


def _canonical_word(
    text: str, accuracy: int, stress: int, phones: list[str], phones_accuracy: list[float]
):
    return {
        "text": text,
        "accuracy": accuracy,
        "stress": stress,
        "total": accuracy,
        "phones": phones,
        "phones-accuracy": phones_accuracy,
    }


def test_match_words_and_phones_valid_case_produces_word_and_phone_examples():
    word_spans = [TextGridSpan(0.0, 0.5, "we"), TextGridSpan(0.5, 1.0, "call")]
    phone_spans = [
        TextGridSpan(0.0, 0.25, "W"),
        TextGridSpan(0.25, 0.5, "IY1"),
        TextGridSpan(0.5, 0.75, "K"),
        TextGridSpan(0.75, 1.0, "AO0"),
    ]
    canonical_words = [
        _canonical_word("we", 10, 10, ["W", "IY0"], [2.0, 2.0]),
        _canonical_word("call", 6, 5, ["K", "AO0"], [2.0, 1.0]),
    ]

    word_examples, phone_examples, valid = _match_words_and_phones(
        word_spans, phone_spans, canonical_words, duration_sec=1.0, num_frames=100
    )

    assert valid
    assert len(word_examples) == 2
    assert word_examples[0].accuracy == pytest.approx(1.0)
    assert word_examples[1].stress == pytest.approx(0.0)  # stress=5 -> misplaced
    assert len(phone_examples) == 4
    assert phone_examples[-1].accuracy == pytest.approx(0.5)  # 1.0 / 2.0
    # Canonical (expected) identities, not MFA's recognized IY1 / AO0 labels.
    assert word_examples[0].phone_ids == [canonical_phone_id("W"), canonical_phone_id("IY0")]
    assert [phone.phone_id for phone in phone_examples] == [
        canonical_phone_id(label) for label in ("W", "IY0", "K", "AO0")
    ]


def test_match_words_and_phones_masks_whole_record_on_word_count_mismatch():
    word_spans = [TextGridSpan(0.0, 1.0, "we")]  # only 1, canonical has 2
    canonical_words = [
        _canonical_word("we", 10, 10, ["W", "IY0"], [2.0, 2.0]),
        _canonical_word("call", 6, 5, ["K", "AO0"], [2.0, 1.0]),
    ]

    word_examples, phone_examples, valid = _match_words_and_phones(
        word_spans, [], canonical_words, duration_sec=1.0, num_frames=100
    )

    assert not valid
    assert word_examples == []
    assert phone_examples == []


def test_match_words_and_phones_masks_only_mismatched_word_phones():
    word_spans = [TextGridSpan(0.0, 0.5, "we"), TextGridSpan(0.5, 1.0, "call")]
    # "we" gets both its phones aligned; "call" only gets 1 MFA phone span
    # though canonical expects 2 -> that word's phones should be dropped.
    phone_spans = [
        TextGridSpan(0.0, 0.25, "W"),
        TextGridSpan(0.25, 0.5, "IY1"),
        TextGridSpan(0.5, 1.0, "K"),
    ]
    canonical_words = [
        _canonical_word("we", 10, 10, ["W", "IY0"], [2.0, 2.0]),
        _canonical_word("call", 6, 5, ["K", "AO0"], [2.0, 1.0]),
    ]

    word_examples, phone_examples, valid = _match_words_and_phones(
        word_spans, phone_spans, canonical_words, duration_sec=1.0, num_frames=100
    )

    assert valid
    assert len(word_examples) == 2
    assert len(phone_examples) == 2  # only "we"'s two phones


def _write_record_assets(
    tmp_path: Path,
    *,
    sample_id: str,
    num_frames: int,
    words: list[tuple[float, float, str]],
    phones: list[tuple[float, float, str]],
    duration: float = 1.0,
) -> ManifestRecord:
    feature_root = tmp_path / "features"
    waveform_dir = feature_root / "waveform"
    hidden_dir = feature_root / "wav2vec2-hidden-states-abc"
    waveform_dir.mkdir(parents=True, exist_ok=True)
    hidden_dir.mkdir(parents=True, exist_ok=True)

    np.save(waveform_dir / f"{sample_id}.npy", np.zeros((1, 16000), dtype=np.float32))
    np.save(hidden_dir / f"{sample_id}.npy", np.zeros((num_frames, 768), dtype=np.float32))

    textgrid_relative = f"mfa-output/{sample_id}.TextGrid"
    _write_textgrid(tmp_path / textgrid_relative, duration=duration, words=words, phones=phones)

    return ManifestRecord(
        sample_id=sample_id,
        dataset="speechocean762",
        dataset_version="test",
        source=SourceInfo(
            origin="openslr",
            resource_id=101,
            url="https://example.invalid/speechocean762.tar.gz",
            license="CC-BY-4.0",
            citation="zhang2021speechocean762",
        ),
        speaker_id="0001",
        speaker_age_group="adult",
        speaker_gender="m",
        official_split="train",
        partition="train",
        consent_class="public_licensed_corpus",
        audio=AudioInfo(
            relative_path=f"WAVE/{sample_id}.WAV",
            sha256="abc",
            duration_sec=duration,
            sample_rate=16000,
        ),
        text_reference="we call",
        scores={
            "sentence": {
                "accuracy": 8,
                "fluency": 9,
                "prosodic": 9,
                "completeness": 10.0,
                "total": 8,
            },
            "words": [
                _canonical_word("we", 10, 10, ["W", "IY0"], [2.0, 2.0]),
                _canonical_word("call", 6, 5, ["K", "AO0"], [2.0, 1.0]),
            ],
        },
        alignment=AlignmentInfo(
            status="aligned",
            textgrid_relative_path=textgrid_relative,
            oov_word_count=0,
            unaligned_word_count=0,
            quality_score=1.0,
        ),
        features=FeatureInfo(
            waveform_cache_path=f"waveform/{sample_id}.npy",
            wav2vec2_hidden_state_path=f"wav2vec2-hidden-states-abc/{sample_id}.npy",
            encoder_revision="abc",
            code_version="test",
        ),
        derivation=DerivationInfo(code_version="test", generated_at="2026-07-24T00:00:00+00:00"),
    )


def test_dataset_and_collate_end_to_end(tmp_path: Path):
    record_a = _write_record_assets(
        tmp_path,
        sample_id="SAMPLE_A",
        num_frames=50,
        words=[(0.0, 0.5, "we"), (0.5, 1.0, "call")],
        phones=[(0.0, 0.25, "W"), (0.25, 0.5, "IY1"), (0.5, 0.75, "K"), (0.75, 1.0, "AO0")],
    )
    record_b = _write_record_assets(
        tmp_path,
        sample_id="SAMPLE_B",
        num_frames=80,
        words=[(0.0, 1.0, "we")],  # mismatched: only 1 word tier interval
        phones=[],
    )

    manifest_path = tmp_path / "manifest.jsonl"
    write_jsonl(manifest_path, [record_a, record_b])

    dataset = SpeechOceanScoringDataset(manifest_path, tmp_path, partition="train")
    assert len(dataset) == 2

    batch = collate_fn([dataset[0], dataset[1]])

    assert batch["hidden_states"].shape == (2, 80, 768)
    assert batch["frame_mask"][0].sum().item() == 50
    assert batch["frame_mask"][1].sum().item() == 80
    assert batch["sentence_targets"].shape == (2, 4)
    assert torch.allclose(batch["sentence_targets"][0], torch.tensor([0.8, 0.9, 0.9, 1.0]))
    assert batch["word_alignment_valid"] == [True, False]
    assert len(batch["word_examples"][0]) == 2
    assert batch["word_examples"][1] == []


def test_dataset_loads_a_multi_layer_cache_and_collates_it(tmp_path: Path):
    from echolingo_speech.features.cache import layer_cache_dir_name

    layers = (4, 12)
    records = []
    for sample_id, num_frames in (("SAMPLE_A", 50), ("SAMPLE_B", 80)):
        record = _write_record_assets(
            tmp_path,
            sample_id=sample_id,
            num_frames=num_frames,
            words=[(0.0, 0.5, "we"), (0.5, 1.0, "call")],
            phones=[(0.0, 0.25, "W"), (0.25, 0.5, "IY1"), (0.5, 0.75, "K"), (0.75, 1.0, "AO0")],
        )
        layer_dir = tmp_path / "features" / layer_cache_dir_name("abc", layers)
        layer_dir.mkdir(parents=True, exist_ok=True)
        stacked = np.stack([np.full((num_frames, 768), value) for value in (1.0, 2.0)])
        np.save(layer_dir / f"{sample_id}.npy", stacked.astype(np.float16))
        records.append(record)
    manifest_path = tmp_path / "manifest.jsonl"
    write_jsonl(manifest_path, records)

    dataset = SpeechOceanScoringDataset(
        manifest_path, tmp_path, partition="train", hidden_state_layers=list(layers)
    )
    batch = collate_fn([dataset[0], dataset[1]])

    assert dataset[0].hidden_states.shape == (2, 50, 768)
    assert batch["hidden_states"].shape == (2, 2, 80, 768)
    assert batch["hidden_states"].dtype == torch.float32
    assert batch["frame_mask"][0].sum().item() == 50
    assert torch.all(batch["hidden_states"][0, 1, :50] == 2.0)
    assert torch.all(batch["hidden_states"][0, :, 50:] == 0.0)
    # Spans are mapped over the cached frame count, as for a single layer.
    assert len(dataset[0].word_examples) == 2


def test_layer_cache_dir_name_is_deterministic_per_revision_and_layers():
    from echolingo_speech.features.cache import layer_cache_dir_name

    name = layer_cache_dir_name("22aad52d435eb6dbaf354bdad9b0da84ce7d6156", [4, 6, 12])
    assert name == "wav2vec2-layers-22aad52d435e-l4-6-12"
    assert name != layer_cache_dir_name("22aad52d435eb6dbaf354bdad9b0da84ce7d6156", [4, 6])


def _write_layer_cache(feature_root: Path, sample_id: str, num_frames: int, value: float) -> None:
    from echolingo_speech.features.cache import layer_cache_dir_name

    layer_dir = feature_root / layer_cache_dir_name("abc", (4, 12))
    layer_dir.mkdir(parents=True, exist_ok=True)
    stacked = np.full((2, num_frames, 768), value, dtype=np.float16)
    np.save(layer_dir / f"{sample_id}.npy", stacked)


def _augmented_fixture(tmp_path: Path, variants: list[str]) -> Path:
    """Two training records with a clean 2-layer cache (value 1.0) and, per
    variant k, an augmented copy (value k + 1, louder waveform)."""
    from echolingo_speech.features.cache import variant_feature_root

    records = []
    for sample_id, num_frames in (("SAMPLE_A", 50), ("SAMPLE_B", 80)):
        records.append(
            _write_record_assets(
                tmp_path,
                sample_id=sample_id,
                num_frames=num_frames,
                words=[(0.0, 0.5, "we"), (0.5, 1.0, "call")],
                phones=[(0.0, 0.25, "W"), (0.25, 0.5, "IY1"), (0.5, 0.75, "K"), (0.75, 1.0, "AO0")],
            )
        )
        _write_layer_cache(tmp_path / "features", sample_id, num_frames, 1.0)
        for k, variant in enumerate(variants, start=1):
            root = variant_feature_root(tmp_path / "features", variant)
            (root / "waveform").mkdir(parents=True, exist_ok=True)
            waveform = np.full((1, 16000), 0.1 * k, dtype=np.float32)
            np.save(root / "waveform" / f"{sample_id}.npy", waveform)
            _write_layer_cache(root, sample_id, num_frames, float(k + 1))
    manifest_path = tmp_path / "manifest.jsonl"
    write_jsonl(manifest_path, records)
    return manifest_path


def test_dataset_reads_a_feature_variant_with_the_clean_spans(tmp_path: Path):
    manifest_path = _augmented_fixture(tmp_path, ["validation-noisy-1"])
    clean = SpeechOceanScoringDataset(
        manifest_path, tmp_path, partition="train", hidden_state_layers=[4, 12]
    )
    noisy = SpeechOceanScoringDataset(
        manifest_path, tmp_path, partition="train", hidden_state_layers=[4, 12],
        feature_variant="validation-noisy-1",
    )
    assert torch.all(noisy[0].hidden_states == 2.0)
    assert noisy[0].word_examples == clean[0].word_examples
    assert torch.equal(noisy[0].sentence_targets, clean[0].sentence_targets)
    assert not torch.equal(noisy[0].acoustic_features, clean[0].acoustic_features)


def test_feature_variant_needs_a_layer_cache(tmp_path: Path):
    manifest_path = _augmented_fixture(tmp_path, ["validation-noisy-1"])
    with pytest.raises(ValueError, match="hidden_state_layers"):
        SpeechOceanScoringDataset(
            manifest_path, tmp_path, partition="train", feature_variant="validation-noisy-1"
        )


def test_augmented_training_dataset_mixes_clean_and_copies(tmp_path: Path):
    from echolingo_speech.training.dataset import AugmentedTrainingDataset

    variants = ["train-aug-1", "train-aug-2"]
    manifest_path = _augmented_fixture(tmp_path, variants)
    clean = SpeechOceanScoringDataset(
        manifest_path, tmp_path, partition="train", hidden_state_layers=[4, 12]
    )

    never = AugmentedTrainingDataset(clean, tmp_path, [4, 12], variants, 0.0)
    assert never[1] is clean[1]

    always = AugmentedTrainingDataset(clean, tmp_path, [4, 12], variants, 1.0)
    torch.manual_seed(0)
    seen = set()
    for _ in range(40):
        example = always[1]
        value = example.hidden_states[0, 0, 0].item()
        assert value in (2.0, 3.0)
        seen.add(value)
        assert example.hidden_states.shape == clean[1].hidden_states.shape
        assert example.word_examples == clean[1].word_examples
        assert not torch.equal(example.acoustic_features, clean[1].acoustic_features)
    assert seen == {2.0, 3.0}
    # The clean example is never modified in place.
    assert torch.all(clean[1].hidden_states == 1.0)

    batch = collate_fn([always[0], always[1]])
    assert batch["hidden_states"].shape == (2, 2, 80, 768)


def test_augmented_training_dataset_rejects_a_missing_or_mismatched_copy(tmp_path: Path):
    from echolingo_speech.features.cache import variant_feature_root
    from echolingo_speech.training.dataset import AugmentedTrainingDataset

    manifest_path = _augmented_fixture(tmp_path, ["train-aug-1"])
    clean = SpeechOceanScoringDataset(
        manifest_path, tmp_path, partition="train", hidden_state_layers=[4, 12]
    )
    with pytest.raises(FileNotFoundError, match="features.augment"):
        AugmentedTrainingDataset(clean, tmp_path, [4, 12], ["train-aug-9"], 0.5)

    root = variant_feature_root(tmp_path / "features", "train-aug-1")
    _write_layer_cache(root, "SAMPLE_A", 49, 2.0)
    shifted = AugmentedTrainingDataset(clean, tmp_path, [4, 12], ["train-aug-1"], 1.0)
    with pytest.raises(ValueError, match="shape"):
        shifted[0]


def test_partition_loader_wraps_training_with_augmented_copies(tmp_path: Path):
    from echolingo_speech.training.dataset import AugmentedTrainingDataset
    from echolingo_speech.training.loop import _partition_loader

    manifest_path = _augmented_fixture(tmp_path, ["train-aug-1"])
    loader = _partition_loader(
        manifest_path, tmp_path, "train", 2, shuffle=False,
        hidden_state_layers=[4, 12],
        augmentation_variants=["train-aug-1"],
        augmentation_prob=1.0,
    )
    assert isinstance(loader.dataset, AugmentedTrainingDataset)
    batch = next(iter(loader))
    assert torch.all(batch["hidden_states"][0, :, :50] == 2.0)
