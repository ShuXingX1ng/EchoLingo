"""M3 A1 Loquacious data: the CTC character vocabulary, parquet shards
prepared once into 16 kHz int16 audio, and duration-bucketed batches."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import torch

from echolingo_speech.encoder.loquacious import (
    DurationBatchSampler,
    LoquaciousDataset,
    collate_ctc,
    prepare,
    read_index,
)


def test_vocab_accepts_only_its_own_alphabet(char_vocab):
    assert char_vocab.blank_id == 0 and char_vocab.delimiter_id == 4
    assert char_vocab.is_encodable("WE CALL IT BEAR")
    assert char_vocab.is_encodable("DON'T")
    for text in ("we call", "HELLO, WORLD", "COVID 19", "", "   "):
        assert not char_vocab.is_encodable(text)


def test_encode_maps_spaces_to_the_word_delimiter(char_vocab):
    W, E, C, A, L = (char_vocab.token_to_id[c] for c in "WECAL")
    assert char_vocab.encode("  WE   CALL ") == [W, E, 4, C, A, L, L]


def test_greedy_decoding_collapses_repeats_and_drops_blanks(char_vocab):
    W, E, C, A, L = (char_vocab.token_to_id[c] for c in "WECAL")
    # A blank between the two Ls keeps both; the doubled W and | collapse.
    frames = [0, W, W, 0, E, 4, 4, C, A, L, 0, L, 0, 4]
    assert char_vocab.decode_greedy(frames) == "WE CALL"
    # <s>, </s> and <unk> never appear in a transcript.
    assert char_vocab.decode_greedy([1, W, 3, E, 4, 2, C, A, L, 0, L]) == "WE CALL"
    assert char_vocab.decode_greedy([0, 0]) == ""


def _shard_rows():
    return [
        ("a", 1.5, 16000, "WE CALL IT BEAR"),
        ("b", 2.0, 8000, "IT'S RESAMPLED"),
        ("c", 1.2, 16000, "lower case is skipped"),
        ("d", 0.5, 16000, "TOO SHORT"),
        ("e", 3.0, 16000, "TOO LONG"),
    ]


def test_prepare_decodes_filters_and_resamples(tmp_path: Path, char_vocab, write_loquacious_shard):
    shard = write_loquacious_shard(tmp_path / "parquet" / "train-0.parquet", _shard_rows())
    out = tmp_path / "prepared"
    totals = prepare([shard], out, char_vocab, min_seconds=1.0, max_seconds=2.5, workers=1)
    assert totals == {"kept": 2, "too_short": 1, "too_long": 1, "bad_text": 1, "decode_error": 0}

    utterances = read_index(out)
    assert [(u.utt_id, u.text) for u in utterances] == [
        ("a", "WE CALL IT BEAR"), ("b", "IT'S RESAMPLED"),
    ]
    a, b = utterances
    assert (a.offset, a.length) == (0, 24000)
    # 8 kHz is resampled to 16 kHz: twice the samples, same duration.
    assert (b.offset, b.length) == (24000, 32000)
    assert b.seconds == pytest.approx(2.0)
    audio = np.fromfile(out / "train-0.int16", dtype=np.int16)
    assert audio.size == 56000
    assert np.abs(audio[:24000]).max() == pytest.approx(0.2 * 32768, rel=0.01)


def test_prepare_resumes_per_finished_shard(tmp_path: Path, char_vocab, write_loquacious_shard):
    shard = write_loquacious_shard(tmp_path / "train-0.parquet", _shard_rows()[:1])
    out = tmp_path / "prepared"
    first = prepare([shard], out, char_vocab, workers=1)
    written = (out / "train-0.int16").stat().st_mtime_ns
    assert prepare([shard], out, char_vocab, workers=1) == first
    assert (out / "train-0.int16").stat().st_mtime_ns == written


def test_read_index_refuses_an_unfinished_shard(tmp_path: Path):
    with pytest.raises(FileNotFoundError, match="no prepared shards"):
        read_index(tmp_path)
    (tmp_path / "train-0.jsonl").write_text(
        json.dumps({"id": "a", "offset": 0, "length": 10, "text": "A"}) + "\n"
    )
    with pytest.raises(ValueError, match="1 unfinished shards"):
        read_index(tmp_path)


def test_dataset_items_and_ctc_collation(tmp_path: Path, char_vocab, write_loquacious_shard):
    rows = [("a", 1.5, 16000, "WE CALL"), ("b", 1.0, 16000, "IT")]
    shard = write_loquacious_shard(tmp_path / "train-0.parquet", rows)
    out = tmp_path / "prepared"
    prepare([shard], out, char_vocab, workers=1)
    dataset = LoquaciousDataset(out, char_vocab, read_index(out))
    item = dataset[0]
    assert item["audio"].dtype == torch.float32 and item["audio"].numel() == 24000
    assert item["audio"].abs().max() <= 1.0
    assert item["labels"].tolist() == char_vocab.encode("WE CALL")

    batch = collate_ctc([dataset[0], dataset[1]])
    assert batch["input_values"].shape == (2, 24000)
    assert batch["lengths"].tolist() == [24000, 16000]
    assert torch.all(batch["input_values"][1, 16000:] == 0)
    assert batch["labels"][1].tolist() == char_vocab.encode("IT") + [-100] * 5
    assert batch["texts"] == ["WE CALL", "IT"]


def _lengths() -> list[int]:
    rng = np.random.default_rng(0)
    return [int(s * 16000) for s in rng.uniform(1.0, 6.0, size=200)]


def test_batches_cover_every_utterance_within_the_audio_budget():
    lengths = _lengths()
    sampler = DurationBatchSampler(lengths, max_batch_seconds=20.0, seed=3, bucket_size=50)
    batches = list(sampler)
    assert sorted(i for batch in batches for i in batch) == list(range(len(lengths)))
    for batch in batches:
        assert max(lengths[i] for i in batch) * len(batch) <= 20 * 16000
    assert len(sampler) == len(batches)


def test_batches_depend_only_on_seed_and_epoch_and_resume_by_skipping():
    lengths = _lengths()
    sampler = DurationBatchSampler(lengths, max_batch_seconds=20.0, seed=3, bucket_size=50)
    sampler.set_epoch(1)
    epoch_one = list(sampler)
    again = DurationBatchSampler(lengths, max_batch_seconds=20.0, seed=3, bucket_size=50)
    again.set_epoch(1)
    assert list(again) == epoch_one
    again.set_epoch(2)
    assert list(again) != epoch_one
    again.set_epoch(1, skip_batches=5)
    assert list(again) == epoch_one[5:]
    assert len(again) == len(epoch_one) - 5


def test_unshuffled_batches_sort_the_whole_set_and_reject_overlong_audio():
    sampler = DurationBatchSampler([16000, 48000, 32000], max_batch_seconds=6.0, shuffle=False)
    assert list(sampler) == [[0, 2], [1]]
    lengths = _lengths()
    batches = list(DurationBatchSampler(lengths, 20.0, shuffle=False, bucket_size=50))
    flat = [lengths[i] for batch in batches for i in batch]
    assert flat == sorted(lengths)
    with pytest.raises(ValueError, match="longer than max_batch_seconds"):
        DurationBatchSampler([16000 * 30], max_batch_seconds=20.0)
