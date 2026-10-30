"""M6: a synthetic benchmark for omitted, inserted and repeated words
(`worker/reading_errors.py`).

SpeechOcean labels no omissions, insertions or repetitions, so they are
made: every validation recording is evaluated as is and three more times,
each with one known change at a word chosen at random:

- `omit`: an inner word cut out, from the middle of the gap before it to
  the middle of the gap after it;
- `repeat`: a word's aligned audio played again in the gap after it;
- `insert`: a word read earlier in validation (mostly by the same speaker,
  since validation is in speaker order), not in this reference, played in
  a gap at this recording's loudness.

Inserted audio is framed by 50 ms of the recording's own room tone. The
reference text never changes, so the Worker sees what a learner's mistake
gives it. Validation only (the sealed test stays sealed).

- `collect` runs the Worker's encoder, `mfa align_one` and scorer on each
  version and writes one JSON line per recording: the word spans and
  scores, the free ASR's timed words and the frame energy.
- `report` replays `worker/reading_errors.py::detect` on those rows for
  every candidate threshold. Validation speakers are split in two
  (alternately, in speaker order): each kind's thresholds are the
  candidate with the highest recall at precision >= 0.9 on the tuning
  half, and the held-out half gives the precision and recall reported. A
  kind ships only if its held-out precision is at least 0.9.

Precision is strict: every error reported anywhere but at the planted
change counts against it, including those in the unchanged recordings,
although a learner may really have left out or repeated a word there.

CLI: `python -m echolingo_speech.evaluation.reading_errors collect|report ...`
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import random
import statistics
from collections import deque
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from echolingo_speech.alignment.mfa import TextGridSpan, normalize_text
from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.evaluation.fluency_events import gap_midpoint_sample, room_tone
from echolingo_speech.features.cache import TARGET_SAMPLE_RATE
from echolingo_speech.worker.aligner import AlignmentError
from echolingo_speech.worker.pipeline import AlignedWord, aligned_words
from echolingo_speech.worker.reading_errors import KindThresholds, RecognizedWord, detect

FRAME_SEC = 0.02
INSERT_MARGIN_SEC = 0.05
# Words that may be inserted elsewhere: scored well, at least three phones.
DONOR_MIN_ACCURACY = 8.0
DONOR_MIN_PHONES = 3
DONOR_POOL_SIZE = 200


# --- one version of a recording ---------------------------------------------------


def frame_db(waveform: np.ndarray) -> list[float]:
    """RMS level of each 20 ms frame, in dB full scale."""
    size = int(FRAME_SEC * TARGET_SAMPLE_RATE)
    frames = waveform[: len(waveform) // size * size].reshape(-1, size)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    return [round(float(v), 1) for v in 20 * np.log10(rms + 1e-8)]


def observe(pipeline, waveform: np.ndarray, reference_words: list[str]
            ) -> tuple[dict, list[AlignedWord] | None]:
    """What the Worker makes of one version, and its aligned words."""
    tensor = torch.from_numpy(waveform).unsqueeze(0)
    encoded = pipeline.encoder.encode(tensor)
    try:
        alignment = pipeline.aligner.align(waveform, TARGET_SAMPLE_RATE,
                                           " ".join(reference_words))
    except AlignmentError:
        alignment = None
    result = pipeline.score(tensor, encoded, alignment, reference_words)
    words = aligned_words(alignment, reference_words) if alignment is not None else None
    withheld = result.evidence_status.word.reason if result.evidence_status.word.status == (
        "unavailable") else None
    observation = {
        "withheld": withheld,
        "recognized": [{"text": w.text, "start": round(w.start_sec, 3),
                        "end": round(w.end_sec, 3)} for w in encoded.recognized_words],
        "words": None if withheld else [
            {"start": w.start_sec, "end": w.end_sec,
             "phones": len(w.phonemes), "oov": w.status == "out_of_vocabulary",
             "accuracy": None if w.accuracy is None else round(w.accuracy, 3)}
            for w in result.words
        ],
        "frame_db": frame_db(waveform),
    }
    return observation, (None if withheld else words)


# --- the changed versions --------------------------------------------------------


def _samples(seconds: float) -> int:
    return int(round(seconds * TARGET_SAMPLE_RATE))


def without_word(waveform: np.ndarray, words: list[AlignedWord], index: int) -> np.ndarray:
    """Inner word `index` cut out between the midpoints of its gaps."""
    return np.concatenate([waveform[: gap_midpoint_sample(words, index - 1)],
                           waveform[gap_midpoint_sample(words, index):]])


def with_audio_after(waveform: np.ndarray, words: list[AlignedWord], after: int,
                     clip: np.ndarray) -> np.ndarray:
    """`clip`, framed by room tone, midway through the gap after word `after`."""
    cut = gap_midpoint_sample(words, after)
    tone = room_tone(waveform, words, INSERT_MARGIN_SEC)
    return np.concatenate([waveform[:cut], tone, clip, tone, waveform[cut:]])


def word_audio(waveform: np.ndarray, word: AlignedWord) -> np.ndarray:
    return waveform[_samples(word.span.start): _samples(word.span.end)]


def speech_rms(waveform: np.ndarray, words: list[AlignedWord]) -> float:
    clips = [word_audio(waveform, w) for w in words]
    joined = np.concatenate(clips) if clips else waveform
    return float(np.sqrt(np.mean(joined.astype(np.float64) ** 2)))


def collect_row(pipeline, record: ManifestRecord, waveform: np.ndarray,
                donors: deque, seed: int = 0) -> dict:
    """Every version of one recording; adds its well-read words to `donors`."""
    reference_words = normalize_text(record.text_reference).split()
    original, words = observe(pipeline, waveform, reference_words)
    row = {
        "sample_id": record.sample_id,
        "speaker_id": record.speaker_id,
        "age_group": record.speaker_age_group,
        "fluency": float(record.scores["sentence"]["fluency"]),
        "completeness": float(record.scores["sentence"]["completeness"]),
        "reference": reference_words,
        "expert_word_accuracy": [float(w["accuracy"]) for w in record.scores["words"]],
        "original": original,
        "omit": None, "repeat": None, "insert": None,
    }
    if words is None or len(words) < 2:
        return row
    rng = random.Random(f"{seed}:{record.sample_id}")
    if len(words) >= 3:
        index = rng.randrange(1, len(words) - 1)
        row["omit"] = {"word": index, "observed": observe(
            pipeline, without_word(waveform, words, index), reference_words)[0]}
    index = rng.randrange(len(words) - 1)
    row["repeat"] = {"word": index, "observed": observe(
        pipeline, with_audio_after(waveform, words, index, word_audio(waveform, words[index])),
        reference_words)[0]}
    candidates = [d for d in donors if d[0] not in reference_words]
    if candidates:
        text, clip, rms = rng.choice(candidates)
        after = rng.randrange(len(words) - 1)
        scaled = (clip * (speech_rms(waveform, words) / max(rms, 1e-8))).astype(np.float32)
        row["insert"] = {"after_word": after, "text": text, "observed": observe(
            pipeline, with_audio_after(waveform, words, after, scaled), reference_words)[0]}

    level = speech_rms(waveform, words)
    for word, observed in zip(words, original["words"]):
        if (not observed["oov"] and observed["phones"] >= DONOR_MIN_PHONES
                and (observed["accuracy"] or 0.0) >= DONOR_MIN_ACCURACY):
            donors.append((word.text, word_audio(waveform, word).copy(), level))
    return row


def collect(pipeline, records: list[ManifestRecord], corpus_root: Path, out: Path,
            log_every: int = 20) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    donors: deque = deque(maxlen=DONOR_POOL_SIZE)
    with out.open("w", encoding="utf-8") as handle:
        for index, record in enumerate(records):
            waveform, sample_rate = sf.read(corpus_root / record.audio.relative_path,
                                            dtype="float32")
            if sample_rate != TARGET_SAMPLE_RATE or waveform.ndim != 1:
                raise ValueError(f"{record.sample_id}: expected 16 kHz mono")
            handle.write(json.dumps(collect_row(pipeline, record, waveform, donors)) + "\n")
            handle.flush()
            if log_every and (index + 1) % log_every == 0:
                print(f"{index + 1}/{len(records)} collected", flush=True)


# --- report -----------------------------------------------------------------------

MIN_PRECISION = 0.9
# A tuning candidate needs this many reports for its precision to count.
MIN_REPORTS = 10
MATCH_GRID = (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
GRIDS: dict[str, list[KindThresholds]] = {
    "omitted": [KindThresholds(match_similarity=m, max_sec_per_phone=p, min_phones=n)
                for m, p, n in itertools.product(
                    MATCH_GRID, (0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12), (1, 2, 3))],
    "inserted": [KindThresholds(match_similarity=m, min_extra_sec=d, min_extra_letters=n,
                                repeat_similarity=r)
                 for m, d, n, r in itertools.product(
                     MATCH_GRID, (0.0, 0.1, 0.15, 0.2, 0.25, 0.3), (1, 2, 3, 4), (0.5, 0.6, 0.7))],
    "repeated": [KindThresholds(match_similarity=m, min_extra_sec=d, min_extra_letters=n,
                                repeat_similarity=r)
                 for m, d, n, r in itertools.product(
                     MATCH_GRID, (0.0, 0.1, 0.15, 0.2, 0.25), (1, 2, 3), (0.5, 0.6, 0.7, 0.8))],
}
# The changed version that plants each kind, and the field naming its word.
PLANTED = {"omitted": ("omit", "word"), "inserted": ("insert", "after_word"),
           "repeated": ("repeat", "word")}
VERSIONS = ("original", "omit", "repeat", "insert")


def _aligned(reference: list[str], spans: list[dict]) -> list[AlignedWord]:
    """Stand-ins for the aligned words: `detect` reads only the text, span,
    phone count and whether the word is out of vocabulary."""
    return [
        AlignedWord(text, TextGridSpan(s["start"], s["end"], text),
                    [TextGridSpan(s["start"], s["end"], "")] * s["phones"], s["oov"])
        for text, s in zip(reference, spans)
    ]


def versions(row: dict) -> list[tuple[str, int | None, list[AlignedWord], list[RecognizedWord]]]:
    """(version, planted word, words, heard) of each version with word evidence."""
    out = []
    for name in VERSIONS:
        entry = row[name]
        if entry is None:
            continue
        observed = entry if name == "original" else entry["observed"]
        if observed["words"] is None:
            continue
        planted = None if name == "original" else entry.get("word", entry.get("after_word"))
        heard = [RecognizedWord(w["text"], w["start"], w["end"]) for w in observed["recognized"]]
        out.append((name, planted, _aligned(row["reference"], observed["words"]), heard))
    return out


def _wilson_lower(hits: int, total: int, z: float = 1.96) -> float | None:
    if total == 0:
        return None
    share = hits / total
    centre = share + z * z / (2 * total)
    margin = z * math.sqrt(share * (1 - share) / total + z * z / (4 * total * total))
    return round((centre - margin) / (1 + z * z / total), 4)


def score_kind(kind: str, rows: list[dict], thresholds: KindThresholds) -> dict:
    planted_version, _ = PLANTED[kind]
    true = false = false_in_original = planted = 0
    for row in rows:
        for name, word, words, heard in versions(row):
            is_planted = name == planted_version
            planted += is_planted
            for error in detect(kind, words, heard, thresholds):
                if is_planted and error.word_index == word:
                    true += 1
                else:
                    false += 1
                    false_in_original += name == "original"
    reports = true + false
    return {
        "reports": reports, "true": true, "false": false,
        "false_in_original": false_in_original, "planted": planted,
        "precision": None if reports == 0 else round(true / reports, 4),
        "precision_lower_95": _wilson_lower(true, reports),
        "recall": None if planted == 0 else round(true / planted, 4),
    }


def split_by_speaker(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """(tuning, held out): validation speakers alternately, in speaker order."""
    speakers = sorted({row["speaker_id"] for row in rows})
    tuning = set(speakers[::2])
    return ([r for r in rows if r["speaker_id"] in tuning],
            [r for r in rows if r["speaker_id"] not in tuning])


def _choose(candidates: list[tuple[KindThresholds, dict]]) -> tuple[KindThresholds, dict] | None:
    passing = [c for c in candidates if c[1]["reports"] >= MIN_REPORTS
               and c[1]["precision"] >= MIN_PRECISION]
    if not passing:
        return None
    return max(passing, key=lambda c: (c[1]["recall"], c[1]["precision"]))


def diagnostics(rows: list[dict]) -> dict:
    """How the planted omissions look to the aligner and the scorer, next
    to every other scored word of the same versions."""
    per_phone = {"omitted": [], "other": []}
    accuracy = {"omitted": [], "other": []}
    for row in rows:
        entry = row["omit"]
        if entry is None or entry["observed"]["words"] is None:
            continue
        for index, word in enumerate(entry["observed"]["words"]):
            if word["oov"] or not word["phones"]:
                continue
            key = "omitted" if index == entry["word"] else "other"
            per_phone[key].append((word["end"] - word["start"]) / word["phones"])
            accuracy[key].append(word["accuracy"])

    def quantiles(values):
        if len(values) < 4:
            return None
        q = statistics.quantiles(values, n=4)
        return {"q1": round(q[0], 3), "median": round(q[1], 3), "q3": round(q[2], 3),
                "n": len(values)}

    return {
        "aligned_sec_per_phone": {k: quantiles(v) for k, v in per_phone.items()},
        "scorer_word_accuracy": {k: quantiles(v) for k, v in accuracy.items()},
    }


def _thresholds_dict(thresholds: KindThresholds) -> dict:
    return {k: v for k, v in vars(thresholds).items()}


def report(rows: list[dict]) -> dict:
    tuning, held_out = split_by_speaker(rows)
    kinds = {}
    for kind, grid in GRIDS.items():
        scored = [(t, score_kind(kind, tuning, t)) for t in grid]
        chosen = _choose(scored)
        if chosen is None:
            kinds[kind] = {"chosen": None, "ships": False, "tuning": None, "held_out": None,
                           "best_tuning_precision": max(
                               (s["precision"] for _, s in scored
                                if s["precision"] is not None and s["reports"] >= MIN_REPORTS),
                               default=None)}
            continue
        thresholds, tuning_scores = chosen
        held_out_scores = score_kind(kind, held_out, thresholds)
        kinds[kind] = {
            "chosen": _thresholds_dict(thresholds),
            "tuning": tuning_scores,
            "held_out": held_out_scores,
            "ships": (held_out_scores["precision"] is not None
                      and held_out_scores["precision"] >= MIN_PRECISION),
        }
    return {
        "created_at": datetime.now(UTC).isoformat(),
        "recordings": len(rows),
        "tuning_recordings": len(tuning), "held_out_recordings": len(held_out),
        "tuning_speakers": len({r["speaker_id"] for r in tuning}),
        "held_out_speakers": len({r["speaker_id"] for r in held_out}),
        "versions_without_word_evidence": sum(
            1 for r in rows for name in VERSIONS if r[name] is not None
            and (r[name] if name == "original" else r[name]["observed"])["words"] is None
        ),
        "rule": (f"tuning: highest recall with precision >= {MIN_PRECISION} over at least "
                 f"{MIN_REPORTS} reports; ships if held-out precision >= {MIN_PRECISION}"),
        "kinds": kinds,
        "diagnostics": diagnostics(rows),
    }


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.evaluation.reading_errors")
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
    report_parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "report":
        rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines()]
        result = report(rows)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print("OK: " + ", ".join(f"{k} ships={v['ships']}" for k, v in result["kinds"].items())
              + f"; wrote {args.out}")
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
