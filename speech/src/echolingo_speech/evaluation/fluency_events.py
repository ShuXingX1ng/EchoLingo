"""M6: choosing the fluency event thresholds on validation (`worker/fluency.py`).

SpeechOcean has a fluency score per sentence but no pause or slow-word
labels, so the thresholds are chosen from two measurements, validation only
(the sealed test stays sealed):

- False alarms: the share of fluent readings (official fluency >= 9) that
  get an event at all. A threshold is the smallest candidate that keeps
  this at or below `MAX_FLUENT_EVENT_RATE`.
- Detection: every validation recording is aligned a second time with a
  pause of known length inserted at a random word boundary (room tone from
  the recording's own leading silence, so it is not digital silence), and a
  detection is a pause event after that word.

The share of disfluent readings (official fluency <= 6) with an event is
reported beside the false-alarm rate. SpeechOcean recordings are single
sentences, so the between-sentence pause threshold is not measured here.

- `collect` aligns each validation recording and its paused copy with the
  Worker's aligner (`mfa align_one`) and writes one JSON line per recording.
- `report` replays `fluency_events` on those spans for every candidate
  threshold and writes the tables and the chosen values.

CLI: `python -m echolingo_speech.evaluation.fluency_events collect|report ...`
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import soundfile as sf

from echolingo_speech.alignment.mfa import TextGridSpan, normalize_text
from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.features.cache import TARGET_SAMPLE_RATE
from echolingo_speech.worker.aligner import AlignmentError
from echolingo_speech.worker.fluency import FluencyThresholds, fluency_events
from echolingo_speech.worker.pipeline import AlignedWord, aligned_words

FLUENT_LABEL = 9.0
DISFLUENT_LABEL = 6.0
MAX_FLUENT_EVENT_RATE = 0.05
# Inserted pause lengths, cycled over the recordings.
INSERTED_PAUSES_SEC = (0.3, 0.5, 0.8, 1.2)
PAUSE_GRID_SEC = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0)
SLOW_WORD_GRID_SEC_PER_PHONE = (0.15, 0.2, 0.25, 0.3, 0.35, 0.4)
SLOW_WORD_MIN_SEC = 0.5
# Room tone is taken from before the first word, keeping clear of it.
ROOM_TONE_MARGIN_SEC = 0.05
ROOM_TONE_MAX_SEC = 0.3


# --- collection ---------------------------------------------------------------------


def _spans(words: list[AlignedWord] | None) -> list[dict] | None:
    if words is None:
        return None
    return [{"start": w.span.start, "end": w.span.end, "phones": len(w.phones),
             "oov": w.out_of_vocabulary} for w in words]


def _align(aligner, waveform: np.ndarray, reference_words: list[str]) -> list[AlignedWord] | None:
    try:
        alignment = aligner.align(waveform, TARGET_SAMPLE_RATE, " ".join(reference_words))
    except AlignmentError:
        return None
    return aligned_words(alignment, reference_words)


def room_tone(waveform: np.ndarray, words: list[AlignedWord], length_sec: float) -> np.ndarray:
    """`length_sec` of the recording's own leading silence, looped (digital
    silence when the recording starts at once)."""
    lead_end = min(words[0].span.start - ROOM_TONE_MARGIN_SEC, ROOM_TONE_MAX_SEC)
    tone = waveform[: max(0, int(lead_end * TARGET_SAMPLE_RATE))]
    if len(tone) < int(ROOM_TONE_MARGIN_SEC * TARGET_SAMPLE_RATE):
        tone = np.zeros(int(ROOM_TONE_MARGIN_SEC * TARGET_SAMPLE_RATE), dtype=waveform.dtype)
    needed = int(round(length_sec * TARGET_SAMPLE_RATE))
    return np.tile(tone, needed // len(tone) + 1)[:needed]


def gap_midpoint_sample(words: list[AlignedWord], after: int) -> int:
    """The sample midway through the gap after word `after`."""
    return int(round((words[after].span.end + words[after + 1].span.start) / 2
                     * TARGET_SAMPLE_RATE))


def with_inserted_pause(
    waveform: np.ndarray, words: list[AlignedWord], after: int, length_sec: float
) -> np.ndarray:
    """`waveform` with `length_sec` of its own room tone inserted midway
    through the gap after word `after`."""
    cut = gap_midpoint_sample(words, after)
    return np.concatenate([waveform[:cut], room_tone(waveform, words, length_sec),
                           waveform[cut:]])


def collect_row(aligner, record: ManifestRecord, waveform: np.ndarray, index: int,
                seed: int = 0) -> dict:
    reference_words = normalize_text(record.text_reference).split()
    words = _align(aligner, waveform, reference_words)
    row = {
        "sample_id": record.sample_id,
        "speaker_id": record.speaker_id,
        "age_group": record.speaker_age_group,
        "fluency": float(record.scores["sentence"]["fluency"]),
        "words": _spans(words),
        "inserted": None,
    }
    if words is not None and len(words) >= 2:
        after = random.Random(f"{seed}:{record.sample_id}").randrange(len(words) - 1)
        length = INSERTED_PAUSES_SEC[index % len(INSERTED_PAUSES_SEC)]
        paused = with_inserted_pause(waveform, words, after, length)
        row["inserted"] = {
            "after_word": after, "length_sec": length,
            "words": _spans(_align(aligner, paused, reference_words)),
        }
    return row


def collect(aligner, records: list[ManifestRecord], corpus_root: Path, out: Path,
            log_every: int = 20) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for index, record in enumerate(records):
            waveform, sample_rate = sf.read(corpus_root / record.audio.relative_path,
                                            dtype="float32")
            if sample_rate != TARGET_SAMPLE_RATE or waveform.ndim != 1:
                raise ValueError(f"{record.sample_id}: expected 16 kHz mono")
            handle.write(json.dumps(collect_row(aligner, record, waveform, index)) + "\n")
            if log_every and (index + 1) % log_every == 0:
                print(f"{index + 1}/{len(records)} collected", flush=True)


# --- report ---------------------------------------------------------------------------


def _words(spans: list[dict]) -> list[AlignedWord]:
    """Stand-ins for the aligned words: `fluency_events` reads only the word
    span, the phone count and whether the word is out of vocabulary."""
    return [
        AlignedWord("", TextGridSpan(s["start"], s["end"], ""),
                    [TextGridSpan(s["start"], s["end"], "")] * s["phones"], s["oov"])
        for s in spans
    ]


def _rate(hits: int, total: int) -> float | None:
    return None if total == 0 else round(hits / total, 4)


def _choose(table: list[dict], key: str) -> float | None:
    for entry in table:
        if entry["fluent_rate"] is not None and entry["fluent_rate"] <= MAX_FLUENT_EVENT_RATE:
            return entry[key]
    return None


def report(rows: list[dict]) -> dict:
    aligned = [r for r in rows if r["words"] is not None]
    fluent = [r for r in aligned if r["fluency"] >= FLUENT_LABEL]
    disfluent = [r for r in aligned if r["fluency"] <= DISFLUENT_LABEL]
    inserted = [r for r in aligned if r["inserted"] and r["inserted"]["words"] is not None]

    def has(row_words, thresholds, kind):
        return any(e.kind == kind for e in fluency_events(_words(row_words), None, thresholds))

    pause_table = []
    for pause in PAUSE_GRID_SEC:
        thresholds = FluencyThresholds(pause_sec=pause, slow_word_sec_per_phone=float("inf"))
        recall = {}
        for length in INSERTED_PAUSES_SEC:
            group = [r for r in inserted if r["inserted"]["length_sec"] == length]
            found = sum(
                any(e.kind == "pause" and e.word_index == r["inserted"]["after_word"]
                    for e in fluency_events(_words(r["inserted"]["words"]), None, thresholds))
                for r in group
            )
            recall[str(length)] = _rate(found, len(group))
        pause_table.append({
            "pause_sec": pause,
            "fluent_rate": _rate(sum(has(r["words"], thresholds, "pause") for r in fluent),
                                 len(fluent)),
            "disfluent_rate": _rate(
                sum(has(r["words"], thresholds, "pause") for r in disfluent), len(disfluent)
            ),
            "inserted_recall_by_length_sec": recall,
        })

    slow_table = []
    for per_phone in SLOW_WORD_GRID_SEC_PER_PHONE:
        thresholds = FluencyThresholds(
            pause_sec=float("inf"), slow_word_sec_per_phone=per_phone,
            slow_word_min_sec=SLOW_WORD_MIN_SEC,
        )
        slow_table.append({
            "slow_word_sec_per_phone": per_phone,
            "fluent_rate": _rate(sum(has(r["words"], thresholds, "slow_word") for r in fluent),
                                 len(fluent)),
            "disfluent_rate": _rate(
                sum(has(r["words"], thresholds, "slow_word") for r in disfluent), len(disfluent)
            ),
        })

    return {
        "created_at": datetime.now(UTC).isoformat(),
        "recordings": len(rows),
        "alignment_failures": len(rows) - len(aligned),
        "inserted_alignment_failures": sum(
            1 for r in aligned if r["inserted"] and r["inserted"]["words"] is None
        ),
        "fluent_recordings": len(fluent),
        "disfluent_recordings": len(disfluent),
        "rule": f"smallest candidate with fluent_rate <= {MAX_FLUENT_EVENT_RATE}",
        "pause": pause_table,
        "slow_word": slow_table,
        "slow_word_min_sec": SLOW_WORD_MIN_SEC,
        "chosen": {
            "pause_sec": _choose(pause_table, "pause_sec"),
            "slow_word_sec_per_phone": _choose(slow_table, "slow_word_sec_per_phone"),
        },
    }


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.evaluation.fluency_events")
    commands = parser.add_subparsers(dest="command", required=True)
    collect_parser = commands.add_parser("collect")
    collect_parser.add_argument("--config", type=Path, required=True, help="speech.yaml")
    collect_parser.add_argument("--manifest", type=Path, required=True)
    collect_parser.add_argument("--corpus-root", type=Path, required=True)
    collect_parser.add_argument(
        "--mfa-cache-dir", type=Path, default=None,
        help="default: <artifact_root>/mfa-cache-eval, apart from a running Worker's",
    )
    collect_parser.add_argument("--limit", type=int, default=None)
    collect_parser.add_argument("--out", type=Path, required=True, help="rows (.jsonl)")
    report_parser = commands.add_parser("report")
    report_parser.add_argument("--rows", type=Path, required=True, help="`collect` output")
    report_parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "collect":
        from echolingo_speech.config import load_config
        from echolingo_speech.worker.aligner import MfaAligner

        config = load_config(args.config)
        aligner = MfaAligner(args.mfa_cache_dir or config.artifact_root / "mfa-cache-eval")
        records = [r for r in read_jsonl(args.manifest) if r.partition == "validation"]
        records = records[: args.limit] if args.limit else records
        collect(aligner, records, args.corpus_root, args.out)
        print(f"OK: wrote {len(records)} rows to {args.out}")
        return 0

    rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines()]
    result = report(rows)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"OK: chose {result['chosen']}; wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
