"""M6: confirming fluency events with the free ASR (`worker/fluency.py`, `confirmed`).

Where the reading departs from the reference, forced alignment invents
pauses and slow words beside the departure. Confirmation removes events the
free ASR does not bear out; this benchmark measures what it removes, on
validation only:

- Invented events: the synthetic copies of the reading error benchmark
  (`evaluation/reading_errors.py`: a word cut out, said again, or another
  word inserted) get events their original does not have. All of them are
  artefacts of the change, since none adds a pause or draws a word out.
- Kept events: every validation recording is changed twice more, with a
  pause of known length inserted at a word boundary (as in
  `evaluation/fluency_events.py`, same seed) and with one word drawn out
  `STRETCH` times (phase vocoder, pitch kept). Of the planted events the
  unconfirmed rule finds, confirmation should keep nearly all.

Fluent and disfluent readers' event rates on the originals are reported
beside them, and the held-out figures for adults and children apart.
Speakers are split alternately into a tuning and a held-out half
(`split_by_speaker`). On the tuning half, the candidate with the
fewest invented events that keeps at least `MIN_KEPT` of the planted pauses
(0.5 s and longer) and of the planted slow words is chosen, then measured
once on the held-out half.

CLI: `python -m echolingo_speech.evaluation.fluency_confirmation collect|report ...`
"""
from __future__ import annotations

import argparse
import itertools
import json
import random
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from echolingo_speech.alignment.mfa import TextGridSpan, normalize_text
from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.evaluation.fluency_events import (
    DISFLUENT_LABEL,
    FLUENT_LABEL,
    INSERTED_PAUSES_SEC,
    with_inserted_pause,
)
from echolingo_speech.evaluation.reading_errors import split_by_speaker
from echolingo_speech.evaluation.reading_errors import versions as reading_error_versions
from echolingo_speech.features.cache import TARGET_SAMPLE_RATE
from echolingo_speech.worker.aligner import AlignmentError
from echolingo_speech.worker.fluency import (
    ConfirmationThresholds,
    confirmed,
    fluency_events,
)
from echolingo_speech.worker.pipeline import AlignedWord, aligned_words
from echolingo_speech.worker.reading_errors import RecognizedWord

STRETCH = 2.5
MIN_KEPT = 0.9
# Planted pauses this long and longer count towards `MIN_KEPT`.
MIN_KEPT_PAUSE_SEC = 0.5
GRID = [
    ConfirmationThresholds(anchor_tolerance_sec=t, pause_max_letters=p,
                           slow_word_extra_letters=s)
    for t, p, s in itertools.product((0.0, 0.1, 0.2), (0, 1, 2), (0, 1, 2, 3, 4, 1000))
]


# --- collection ---------------------------------------------------------------------


def stretched(clip: np.ndarray, factor: float, n_fft: int = 512, hop: int = 128) -> np.ndarray:
    """`clip` played `factor` times as long at the same pitch."""
    import torchaudio.functional as F

    window = torch.hann_window(n_fft)
    spec = torch.stft(torch.from_numpy(clip.astype(np.float32)), n_fft, hop, window=window,
                      return_complex=True)
    advance = torch.linspace(0, np.pi * hop, n_fft // 2 + 1)[..., None]
    slow = F.phase_vocoder(spec, 1 / factor, advance)
    return torch.istft(slow, n_fft, hop, window=window,
                       length=int(len(clip) * factor)).numpy().astype(clip.dtype)


def with_stretched_word(waveform: np.ndarray, words: list[AlignedWord], index: int,
                        factor: float = STRETCH) -> np.ndarray:
    """`waveform` with word `index`'s aligned span drawn out `factor` times."""
    start = int(round(words[index].span.start * TARGET_SAMPLE_RATE))
    end = int(round(words[index].span.end * TARGET_SAMPLE_RATE))
    return np.concatenate([waveform[:start], stretched(waveform[start:end], factor),
                           waveform[end:]])


def observe(pipeline, waveform: np.ndarray, reference_words: list[str]
            ) -> tuple[dict, list[AlignedWord] | None]:
    """The aligned spans and the free ASR's words of one version."""
    encoded = pipeline.encoder.encode(torch.from_numpy(waveform).unsqueeze(0))
    try:
        alignment = pipeline.aligner.align(waveform, TARGET_SAMPLE_RATE,
                                           " ".join(reference_words))
        words = aligned_words(alignment, reference_words)
    except AlignmentError:
        words = None
    return {
        "words": None if words is None else [
            {"start": w.span.start, "end": w.span.end, "phones": len(w.phones),
             "oov": w.out_of_vocabulary} for w in words],
        "recognized": [{"text": w.text, "start": round(w.start_sec, 3),
                        "end": round(w.end_sec, 3)} for w in encoded.recognized_words],
    }, words


def collect_row(pipeline, record: ManifestRecord, waveform: np.ndarray, index: int,
                seed: int = 0) -> dict:
    reference_words = normalize_text(record.text_reference).split()
    original, words = observe(pipeline, waveform, reference_words)
    row = {
        "sample_id": record.sample_id,
        "speaker_id": record.speaker_id,
        "age_group": record.speaker_age_group,
        "fluency": float(record.scores["sentence"]["fluency"]),
        "reference": reference_words,
        "original": original,
        "paused": None,
        "stretched": None,
    }
    if words is None or len(words) < 2:
        return row
    # The same boundary and length as `fluency_events.collect_row`.
    after = random.Random(f"{seed}:{record.sample_id}").randrange(len(words) - 1)
    length = INSERTED_PAUSES_SEC[index % len(INSERTED_PAUSES_SEC)]
    row["paused"] = {"after_word": after, "length_sec": length, "observed": observe(
        pipeline, with_inserted_pause(waveform, words, after, length), reference_words)[0]}
    candidates = [i for i, w in enumerate(words) if not w.out_of_vocabulary and w.phones]
    if candidates:
        word = random.Random(f"{seed}:stretch:{record.sample_id}").choice(candidates)
        row["stretched"] = {"word": word, "factor": STRETCH, "observed": observe(
            pipeline, with_stretched_word(waveform, words, word), reference_words)[0]}
    return row


def collect(pipeline, records: list[ManifestRecord], corpus_root: Path, out: Path,
            log_every: int = 20) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for index, record in enumerate(records):
            waveform, sample_rate = sf.read(corpus_root / record.audio.relative_path,
                                            dtype="float32")
            if sample_rate != TARGET_SAMPLE_RATE or waveform.ndim != 1:
                raise ValueError(f"{record.sample_id}: expected 16 kHz mono")
            handle.write(json.dumps(collect_row(pipeline, record, waveform, index)) + "\n")
            handle.flush()
            if log_every and (index + 1) % log_every == 0:
                print(f"{index + 1}/{len(records)} collected", flush=True)


# --- report -----------------------------------------------------------------------


def _aligned(reference: list[str], spans: list[dict]) -> list[AlignedWord]:
    """Stand-ins for the aligned words: `fluency_events` and `confirmed` read
    only the text, span, phone count and whether the word is out of vocabulary."""
    return [
        AlignedWord(text, TextGridSpan(s["start"], s["end"], text),
                    [TextGridSpan(s["start"], s["end"], "")] * s["phones"], s["oov"])
        for text, s in zip(reference, spans)
    ]


def _heard(observed: dict) -> list[RecognizedWord]:
    return [RecognizedWord(w["text"], w["start"], w["end"]) for w in observed["recognized"]]


def _events(words, heard, thresholds: ConfirmationThresholds | None):
    events = fluency_events(words)
    return events if thresholds is None else confirmed(events, words, heard, thresholds)


def _rate(hits: int, total: int) -> float | None:
    return None if total == 0 else round(hits / total, 4)


def score(rows: list[dict], error_rows: list[dict],
          thresholds: ConfirmationThresholds | None) -> dict:
    """Event rates, planted events found, and invented events; `thresholds`
    None scores the unconfirmed events."""
    fluent = disfluent = fluent_hits = disfluent_hits = 0
    pauses = {str(length): [0, 0] for length in INSERTED_PAUSES_SEC}
    slow = [0, 0]
    for row in rows:
        original = row["original"]
        if original["words"] is None:
            continue
        found = bool(_events(_aligned(row["reference"], original["words"]),
                             _heard(original), thresholds))
        if row["fluency"] >= FLUENT_LABEL:
            fluent += 1
            fluent_hits += found
        if row["fluency"] <= DISFLUENT_LABEL:
            disfluent += 1
            disfluent_hits += found
        for name, kind, field in (("paused", "pause", "after_word"),
                                  ("stretched", "slow_word", "word")):
            entry = row[name]
            if entry is None or entry["observed"]["words"] is None:
                continue
            events = _events(_aligned(row["reference"], entry["observed"]["words"]),
                             _heard(entry["observed"]), thresholds)
            tally = slow if name == "stretched" else pauses[str(entry["length_sec"])]
            tally[0] += any(e.kind == kind and e.word_index == entry[field] for e in events)
            tally[1] += 1

    invented = changed = 0
    for row in error_rows:
        by_name = {name: (words, heard) for name, _, words, heard in reading_error_versions(row)}
        if "original" not in by_name:
            continue
        before = {(e.kind, e.word_index) for e in _events(*by_name["original"], thresholds)}
        for name in ("omit", "repeat", "insert"):
            if name in by_name:
                changed += 1
                invented += sum((e.kind, e.word_index) not in before
                                for e in _events(*by_name[name], thresholds))
    long_pauses = [pauses[str(length)] for length in INSERTED_PAUSES_SEC
                   if length >= MIN_KEPT_PAUSE_SEC]
    return {
        "fluent_rate": _rate(fluent_hits, fluent),
        "disfluent_rate": _rate(disfluent_hits, disfluent),
        "planted_pause_found_by_length_sec": {k: _rate(*v) for k, v in pauses.items()},
        "planted_long_pause_found": _rate(sum(v[0] for v in long_pauses),
                                          sum(v[1] for v in long_pauses)),
        "planted_slow_word_found": _rate(*slow),
        "invented_events": invented,
        "changed_copies": changed,
        "invented_per_copy": _rate(invented, changed),
    }


def _with_kept(scored: dict, unconfirmed: dict) -> dict:
    """`scored` and the share of the unconfirmed rule's planted finds it keeps."""
    def kept(key: str) -> float | None:
        if not unconfirmed[key] or scored[key] is None:
            return None
        return round(scored[key] / unconfirmed[key], 4)

    return {**scored, "kept_long_pauses": kept("planted_long_pause_found"),
            "kept_slow_words": kept("planted_slow_word_found")}


def report(rows: list[dict], error_rows: list[dict]) -> dict:
    tuning, held_out = split_by_speaker(rows)
    tuning_speakers = {r["speaker_id"] for r in tuning}
    error_tuning = [r for r in error_rows if r["speaker_id"] in tuning_speakers]
    error_held_out = [r for r in error_rows if r["speaker_id"] not in tuning_speakers]

    base = score(tuning, error_tuning, None)
    table = [(t, _with_kept(score(tuning, error_tuning, t), base)) for t in GRID]
    passing = [(t, s) for t, s in table
               if (s["kept_long_pauses"] or 0) >= MIN_KEPT
               and (s["kept_slow_words"] or 0) >= MIN_KEPT]
    chosen = min(passing, key=lambda c: (
        c[1]["invented_events"], -c[1]["planted_long_pause_found"],
        -c[1]["planted_slow_word_found"])) if passing else None

    held_out_result = None
    if chosen is not None:
        # Rows collected before `age_group` was kept take it from the error rows.
        ages = {r["sample_id"]: r["age_group"] for r in error_rows}
        held_out_result = {}
        for group in ("all", "adult", "child"):
            def member(row: dict) -> bool:
                return group == "all" or row.get("age_group", ages.get(row["sample_id"])) == group

            group_rows = [r for r in held_out if member(r)]
            group_errors = [r for r in error_held_out if member(r)]
            unconfirmed = score(group_rows, group_errors, None)
            held_out_result[group] = {
                "recordings": len(group_rows),
                "unconfirmed": unconfirmed,
                "confirmed": _with_kept(score(group_rows, group_errors, chosen[0]), unconfirmed),
            }
    return {
        "created_at": datetime.now(UTC).isoformat(),
        "recordings": len(rows),
        "tuning_recordings": len(tuning), "held_out_recordings": len(held_out),
        "tuning_speakers": len(tuning_speakers),
        "held_out_speakers": len({r["speaker_id"] for r in held_out}),
        "stretch": STRETCH,
        "rule": (f"tuning: fewest invented events keeping >= {MIN_KEPT} of the planted "
                 f"pauses (>= {MIN_KEPT_PAUSE_SEC} s) and slow words the unconfirmed rule "
                 "finds; then measured once on the held-out half"),
        "tuning_unconfirmed": base,
        "tuning": [{"thresholds": vars(t), **s} for t, s in table],
        "chosen": None if chosen is None else vars(chosen[0]),
        "held_out": held_out_result,
    }


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m echolingo_speech.evaluation.fluency_confirmation")
    commands = parser.add_subparsers(dest="command", required=True)
    collect_parser = commands.add_parser("collect")
    collect_parser.add_argument("--config", type=Path, required=True, help="speech.yaml")
    collect_parser.add_argument("--manifest", type=Path, required=True)
    collect_parser.add_argument("--corpus-root", type=Path, required=True)
    collect_parser.add_argument("--bundle-id", default=None, help="default: worker_bundle_id")
    collect_parser.add_argument(
        "--mfa-cache-dir", type=Path, default=None,
        help="default: <artifact_root>/mfa-cache-eval, apart from a running Worker's",
    )
    collect_parser.add_argument("--limit", type=int, default=None)
    collect_parser.add_argument("--out", type=Path, required=True, help="rows (.jsonl)")
    report_parser = commands.add_parser("report")
    report_parser.add_argument("--rows", type=Path, required=True, help="`collect` output")
    report_parser.add_argument("--reading-error-rows", type=Path, required=True,
                               help="`reading_errors collect` output")
    report_parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "report":
        def load(path: Path) -> list[dict]:
            return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

        result = report(load(args.rows), load(args.reading_error_rows))
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"OK: chose {result['chosen']}; wrote {args.out}")
        return 0

    from echolingo_speech.config import load_config
    from echolingo_speech.worker.app import build_pipeline, resolve_bundle_dir

    config = load_config(args.config)
    pipeline, _ = build_pipeline(
        bundle_dir=resolve_bundle_dir(config.artifact_root,
                                      args.bundle_id or config.worker_bundle_id),
        hf_cache_dir=config.artifact_root / "hf-cache",
        mfa_cache_dir=args.mfa_cache_dir or config.artifact_root / "mfa-cache-eval",
    )
    records = [r for r in read_jsonl(args.manifest) if r.partition == "validation"]
    records = records[: args.limit] if args.limit else records
    collect(pipeline, records, args.corpus_root, args.out)
    print(f"OK: wrote {len(records)} rows to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
