"""Loquacious audio and transcripts for CTC adaptation (M3 A1-Encoder).

`prepare` decodes the downloaded parquet shards (columns `ID`, `duration`,
`wav` = {bytes, path}, `spk_id`, `sex`, `text`) once into 16 kHz int16 audio,
one `.int16` file plus one `.jsonl` index per shard, so training reads any
utterance by offset instead of re-decoding parquet row groups. Transcripts are
upper-case letters, apostrophes and spaces, the same alphabet as the pinned
encoder's CTC vocabulary; an utterance with any other character, or outside
the duration bounds, is skipped and counted.

`CharVocab` is that vocabulary read from the model repo's `vocab.json`
(blank = `<pad>`, word delimiter = `|`), with greedy CTC decoding.
"""

from __future__ import annotations

import argparse
import io
import json
import random
from collections.abc import Iterator
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset, Sampler

SAMPLE_RATE = 16000
INT16_SCALE = 32768.0
WORD_DELIMITER = "|"
BLANK = "<pad>"


class CharVocab:
    def __init__(self, token_to_id: dict[str, int]) -> None:
        self.token_to_id = dict(token_to_id)
        self.id_to_token = {i: t for t, i in self.token_to_id.items()}
        self.blank_id = self.token_to_id[BLANK]
        self.delimiter_id = self.token_to_id[WORD_DELIMITER]
        self.characters = {
            t for t in self.token_to_id if len(t) == 1 and t != WORD_DELIMITER
        }

    @classmethod
    def from_file(cls, path: Path) -> CharVocab:
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def is_encodable(self, text: str) -> bool:
        return bool(text.strip()) and all(c == " " or c in self.characters for c in text)

    def encode(self, text: str) -> list[int]:
        words = text.split()
        return [
            self.delimiter_id if c == " " else self.token_to_id[c] for c in " ".join(words)
        ]

    def decode_greedy(self, ids: list[int]) -> str:
        """Collapse repeats, map the delimiter to a space and drop the blank
        and the other special tokens (`<s>`, `</s>`, `<unk>`), which no
        training label contains."""
        out, previous = [], None
        for token_id in ids:
            if token_id != previous:
                token = self.id_to_token.get(token_id, "")
                if token_id == self.delimiter_id:
                    out.append(" ")
                elif token in self.characters:
                    out.append(token)
            previous = token_id
        return " ".join("".join(out).split())


@dataclass(frozen=True)
class Utterance:
    shard: str
    offset: int
    length: int
    text: str
    utt_id: str

    @property
    def seconds(self) -> float:
        return self.length / SAMPLE_RATE


def _decode_audio(raw: bytes) -> np.ndarray:
    import soundfile

    data, sample_rate = soundfile.read(io.BytesIO(raw), dtype="float32", always_2d=True)
    audio = torch.from_numpy(data.mean(axis=1))
    if sample_rate != SAMPLE_RATE:
        import torchaudio

        audio = torchaudio.functional.resample(audio, sample_rate, SAMPLE_RATE)
    return np.clip(audio.numpy() * INT16_SCALE, -32768, 32767).astype(np.int16)


def _prepare_shard(args: tuple[Path, Path, dict[str, int], float, float]) -> dict[str, int]:
    import pyarrow.parquet as pq

    parquet_path, out_dir, token_to_id, min_seconds, max_seconds = args
    vocab = CharVocab(token_to_id)
    stem = parquet_path.stem
    audio_path, index_path = out_dir / f"{stem}.int16", out_dir / f"{stem}.jsonl"
    done_marker = out_dir / f"{stem}.done"
    if done_marker.exists():
        return json.loads(done_marker.read_text())
    counts = {"kept": 0, "too_short": 0, "too_long": 0, "bad_text": 0, "decode_error": 0}
    offset = 0
    parquet = pq.ParquetFile(parquet_path)
    with audio_path.open("wb") as audio_out, index_path.open("w", encoding="utf-8") as index_out:
        # Small batches: a whole shard of audio bytes (~300 MB) per worker
        # otherwise sits in memory twice (Arrow and Python).
        for batch in parquet.iter_batches(
            batch_size=64, columns=["ID", "duration", "wav", "text"]
        ):
            for row in batch.to_pylist():
                text = " ".join((row["text"] or "").split())
                if not vocab.is_encodable(text):
                    counts["bad_text"] += 1
                    continue
                if row["duration"] < min_seconds:
                    counts["too_short"] += 1
                    continue
                if row["duration"] > max_seconds:
                    counts["too_long"] += 1
                    continue
                try:
                    audio = _decode_audio(row["wav"]["bytes"])
                except Exception:  # noqa: BLE001 - counted and skipped, never silent
                    counts["decode_error"] += 1
                    continue
                audio_out.write(audio.tobytes())
                entry = {"id": row["ID"], "offset": offset, "length": len(audio), "text": text}
                index_out.write(json.dumps(entry) + "\n")
                offset += len(audio)
                counts["kept"] += 1
    done_marker.write_text(json.dumps(counts))
    return counts


def prepare(
    parquet_files: list[Path],
    out_dir: Path,
    vocab: CharVocab,
    *,
    min_seconds: float = 1.0,
    max_seconds: float = 20.0,
    workers: int = 4,
) -> dict[str, int]:
    """Decode every parquet shard into `out_dir`; resumable per shard."""
    out_dir.mkdir(parents=True, exist_ok=True)
    jobs = [(p, out_dir, vocab.token_to_id, min_seconds, max_seconds) for p in parquet_files]
    totals: dict[str, int] = {}
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for counts in pool.map(_prepare_shard, jobs):
            for key, value in counts.items():
                totals[key] = totals.get(key, 0) + value
    return totals


def read_index(prepared_dir: Path) -> list[Utterance]:
    """Every prepared utterance; refuses a shard that `prepare` has not
    finished rather than training on part of the data."""
    index_paths = sorted(prepared_dir.glob("*.jsonl"))
    if not index_paths:
        raise FileNotFoundError(f"no prepared shards in {prepared_dir}")
    unfinished = [p.name for p in index_paths if not p.with_suffix(".done").exists()]
    if unfinished:
        raise ValueError(f"{len(unfinished)} unfinished shards in {prepared_dir} "
                         f"(e.g. {unfinished[0]}); rerun prepare")
    utterances = []
    for index_path in index_paths:
        shard = index_path.with_suffix(".int16").name
        for line in index_path.read_text(encoding="utf-8").splitlines():
            entry = json.loads(line)
            utterances.append(
                Utterance(shard, entry["offset"], entry["length"], entry["text"], entry["id"])
            )
    return utterances


class LoquaciousDataset(Dataset):
    """Prepared utterances as (float waveform in [-1, 1], label ids, text)."""

    def __init__(self, prepared_dir: Path, vocab: CharVocab, utterances: list[Utterance]) -> None:
        self.prepared_dir = prepared_dir
        self.vocab = vocab
        self.utterances = utterances
        self._maps: dict[str, np.memmap] = {}

    def __len__(self) -> int:
        return len(self.utterances)

    def _audio(self, utterance: Utterance) -> np.ndarray:
        if utterance.shard not in self._maps:
            self._maps[utterance.shard] = np.memmap(
                self.prepared_dir / utterance.shard, dtype=np.int16, mode="r"
            )
        data = self._maps[utterance.shard]
        return np.asarray(data[utterance.offset : utterance.offset + utterance.length])

    def __getitem__(self, index: int) -> dict:
        utterance = self.utterances[index]
        audio = torch.from_numpy(self._audio(utterance).astype(np.float32) / INT16_SCALE)
        return {
            "audio": audio,
            "labels": torch.tensor(self.vocab.encode(utterance.text), dtype=torch.long),
            "text": utterance.text,
        }


class DurationBatchSampler(Sampler[list[int]]):
    """Batches of similar-length utterances, at most `max_batch_seconds` of
    audio each (padding included). Each epoch shuffles, sorts by length within
    buckets of `bucket_size` and then shuffles the batch order; without
    `shuffle` the whole set is sorted. The batches depend only on (seed,
    epoch), so a resumed run skips the ones it already trained on
    (`set_epoch(epoch, skip_batches)`) without loading their audio.

    The group-norm encoder takes zero padding and no attention mask, so the
    padding reaches its CNN normalization and attention: large buckets keep it
    small (simulated on 107k utterances of 1-20 s: 0.15% of the audio, 95% of
    utterances padded by under 2.3%, vs 1.2% and 16% with buckets of 2000)."""

    def __init__(
        self,
        lengths: list[int],
        max_batch_seconds: float,
        *,
        shuffle: bool = True,
        seed: int = 0,
        bucket_size: int = 20000,
    ) -> None:
        self.lengths = lengths
        self.max_samples = int(max_batch_seconds * SAMPLE_RATE)
        self.shuffle = shuffle
        self.seed = seed
        self.bucket_size = bucket_size
        self.epoch = 0
        self.skip_batches = 0
        if max(lengths, default=0) > self.max_samples:
            raise ValueError("an utterance is longer than max_batch_seconds")

    def set_epoch(self, epoch: int, skip_batches: int = 0) -> None:
        self.epoch = epoch
        self.skip_batches = skip_batches

    def _batches(self) -> list[list[int]]:
        rng = random.Random(self.seed + self.epoch)
        order = list(range(len(self.lengths)))
        if self.shuffle:
            rng.shuffle(order)
        batches = []
        bucket_size = self.bucket_size if self.shuffle else max(1, len(order))
        for start in range(0, len(order), bucket_size):
            bucket = sorted(order[start : start + bucket_size], key=self.lengths.__getitem__)
            batch: list[int] = []
            longest = 0
            for index in bucket:
                candidate = max(longest, self.lengths[index])
                if batch and candidate * (len(batch) + 1) > self.max_samples:
                    batches.append(batch)
                    batch, candidate = [], self.lengths[index]
                batch.append(index)
                longest = candidate
            if batch:
                batches.append(batch)
        if self.shuffle:
            rng.shuffle(batches)
        return batches

    def __iter__(self) -> Iterator[list[int]]:
        return iter(self._batches()[self.skip_batches :])

    def __len__(self) -> int:
        return max(0, len(self._batches()) - self.skip_batches)


def collate_ctc(items: list[dict]) -> dict:
    """Zero-pad audio (the base encoder uses group norm and takes no attention
    mask) and pad labels with -100, which the CTC loss ignores."""
    max_audio = max(item["audio"].numel() for item in items)
    max_labels = max(item["labels"].numel() for item in items)
    audio = torch.zeros(len(items), max_audio)
    labels = torch.full((len(items), max_labels), -100, dtype=torch.long)
    for i, item in enumerate(items):
        audio[i, : item["audio"].numel()] = item["audio"]
        labels[i, : item["labels"].numel()] = item["labels"]
    return {
        "input_values": audio,
        "labels": labels,
        "lengths": torch.tensor([item["audio"].numel() for item in items]),
        "texts": [item["text"] for item in items],
    }


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.encoder.loquacious")
    parser.add_argument("--parquet-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--vocab", type=Path, required=True, help="the encoder repo's vocab.json")
    parser.add_argument("--min-seconds", type=float, default=1.0)
    parser.add_argument("--max-seconds", type=float, default=20.0)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args(argv)
    files = sorted(args.parquet_dir.glob("*.parquet"))
    if not files:
        raise FileNotFoundError(f"no parquet files in {args.parquet_dir}")
    totals = prepare(
        files, args.out_dir, CharVocab.from_file(args.vocab),
        min_seconds=args.min_seconds, max_seconds=args.max_seconds, workers=args.workers,
    )
    utterances = read_index(args.out_dir)
    hours = sum(u.seconds for u in utterances) / 3600
    print(f"OK: {len(files)} shards -> {args.out_dir}: {totals}, {hours:.1f} h kept")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
