"""M5: the Provisional Score Normalization parameters for one bundle.

FastAPI turns the Worker's label-scale scores into EchoLingo's 10-90 display
scale (roadmap SS8). The model was trained on the five experts' mean and
evaluated against the official aggregate, so its raw scores run low; a
linear map fitted on validation, prediction -> official label, is meant to
correct that without changing any ranking (it must be increasing). A map is
adopted only where it lowers the mean absolute error; otherwise the score
passes through unchanged. Validation only: the sealed test stays sealed.

Read Aloud Content has no label in SpeechOcean (every recording is a
complete reading of a 3-10 word sentence), so its gate is measured, not
fitted: validation transcripts are joined per speaker into passages of Read
Aloud length, and the chance-corrected letter coverage of each is compared
for the own passage, half of it, and another speaker's passage.

- `collect` runs every validation recording through the Worker's request
  path once (`mfa align_one`, no `reference_not_read` gate) and writes one
  JSON line per recording: reference, ASR, predictions and official labels.
- `fit` reads those lines and writes the calibration file FastAPI loads
  (`backend/data/speech_calibration/<bundle_id>.json`) and a report.
- `passages` joins each validation speaker's recordings, six at a time, into
  one Read Aloud-length recording and scores it through the request path,
  whole and sentence by sentence, against the same sentences scored alone
  (the `collect` rows) and their official labels. Every training recording
  is one sentence, so this is how the Worker's sentence segmentation is
  checked.

CLI: `python -m echolingo_speech.evaluation.display_calibration collect|fit ...`
"""

from __future__ import annotations

import argparse
import io
import json
import random
import statistics
import time
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

from echolingo_speech.alignment.mfa import normalize_text
from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.features.cache import TARGET_SAMPLE_RATE
from echolingo_speech.training.labels import (
    PHONE_SCALE,
    SENTENCE_SCALE,
    WORD_SCALE,
    normalize_phone_accuracy,
    normalize_word_score,
)
from echolingo_speech.worker.aligner import AlignmentError
from echolingo_speech.worker.pipeline import (
    EvaluationError,
    SpeechEvaluationPipeline,
    corrected_character_coverage,
    decode_audio,
    reference_sentences,
)

# The display dimensions and the Worker output each is read from.
SENTENCE_DIMENSIONS = {"pronunciation": "accuracy", "oral_fluency": "fluency"}
PASSAGE_SENTENCES = 6  # about 40 words: a short Read Aloud passage
PASSAGE_DRAWS = 400


def collect_row(pipeline: SpeechEvaluationPipeline, record: ManifestRecord, audio: bytes) -> dict:
    waveform = decode_audio(audio, pipeline.limits)
    encoded = pipeline.encoder.encode(waveform)
    reference_words = normalize_text(record.text_reference).split()
    try:
        alignment = pipeline.aligner.align(
            waveform.squeeze(0).numpy(), TARGET_SAMPLE_RATE, " ".join(reference_words)
        )
    except AlignmentError:
        alignment = None
    result = pipeline.score(waveform, encoded, alignment, reference_words)

    labels = record.scores["words"]
    words = []
    for word in result.words:
        if word.status != "scored":
            continue
        label = labels[word.index]
        phones = (
            [[phoneme.accuracy, normalize_phone_accuracy(target) * PHONE_SCALE]
             for phoneme, target in zip(word.phonemes, label["phones-accuracy"])]
            if len(word.phonemes) == len(label["phones"]) else []
        )
        words.append({
            "prediction": word.accuracy,
            "label": normalize_word_score(label)["accuracy"] * WORD_SCALE,
            "phones": phones,
        })
    return {
        "sample_id": record.sample_id,
        "speaker_id": record.speaker_id,
        "age_group": record.speaker_age_group,
        "reference": " ".join(reference_words),
        "recognized": result.recognized_text,
        "evidence": result.evidence_status.model_dump(),
        "sentence_prediction": result.sentence.model_dump(),
        "sentence_label": {key: float(record.scores["sentence"][key])
                           for key in SENTENCE_DIMENSIONS.values()},
        "words": words,
    }


def collect(
    pipeline: SpeechEvaluationPipeline, records: list[ManifestRecord], corpus_root: Path,
    out: Path, log_every: int = 20,
) -> None:
    pipeline = SpeechEvaluationPipeline(
        pipeline.bundle, pipeline.encoder, pipeline.aligner,
        replace(pipeline.limits, min_reference_character_coverage_corrected=0.0),
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for index, record in enumerate(records):
            audio = (corpus_root / record.audio.relative_path).read_bytes()
            handle.write(json.dumps(collect_row(pipeline, record, audio)) + "\n")
            if log_every and (index + 1) % log_every == 0:
                print(f"{index + 1}/{len(records)} collected", flush=True)


# --- fitting ------------------------------------------------------------------------


def fit_linear(predictions: list[float], labels: list[float]) -> dict:
    """Least-squares `label ~ slope * prediction + intercept`; refuses a
    map that is not increasing, since the normalization must be monotonic."""
    if len(predictions) != len(labels) or len(predictions) < 2:
        raise ValueError("need at least two prediction/label pairs")
    mean_x, mean_y = statistics.fmean(predictions), statistics.fmean(labels)
    sxx = sum((x - mean_x) ** 2 for x in predictions)
    if sxx == 0:
        raise ValueError("predictions are constant")
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(predictions, labels)) / sxx
    if slope <= 0:
        raise ValueError(f"fitted slope {slope:.4f} is not increasing")
    intercept = mean_y - slope * mean_x

    def mae(transform):
        return statistics.fmean(abs(transform(x) - y) for x, y in zip(predictions, labels))

    return {
        "slope": slope,
        "intercept": intercept,
        "pairs": len(predictions),
        "mae_before": mae(lambda x: x),
        "mae_after": mae(lambda x: slope * x + intercept),
        "mean_prediction": mean_x,
        "mean_label": mean_y,
    }


COVERAGE_CUTS = (0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6)


def _quantiles(values: list[float], cuts: tuple[float, ...] = ()) -> dict:
    ordered = sorted(values)
    pick = lambda p: ordered[int(p * (len(ordered) - 1))]  # noqa: E731
    summary = {name: pick(p) for name, p in (
        ("min", 0.0), ("p05", 0.05), ("p25", 0.25), ("median", 0.5),
        ("p75", 0.75), ("p95", 0.95), ("max", 1.0),
    )}
    if cuts:
        summary["share_below"] = {
            str(cut): sum(value < cut for value in ordered) / len(ordered) for cut in cuts
        }
    return summary


def simulate_passages(rows: list[dict], *, seed: int = 0) -> dict:
    """Chance-corrected letter coverage of Read Aloud-length passages made
    by joining one speaker's validation sentences: the speaker's own
    passage, only its first half read, and another speaker's passage
    (sentences not in this one) paired with the same speech. Single
    sentences are reported too."""
    rng = random.Random(seed)
    by_speaker: dict[str, list[dict]] = {}
    for row in rows:
        by_speaker.setdefault(row["speaker_id"], []).append(row)
    speakers = sorted(speaker for speaker, own in by_speaker.items()
                      if len(own) >= PASSAGE_SENTENCES)
    if len(speakers) < 2:
        raise ValueError("need two speakers with a full passage of sentences")

    own, half, wrong, lengths = [], [], [], []
    for _ in range(PASSAGE_DRAWS):
        speaker = rng.choice(speakers)
        group = rng.sample(by_speaker[speaker], PASSAGE_SENTENCES)
        reference = " ".join(row["reference"] for row in group).split()
        recognized = " ".join(row["recognized"] for row in group)
        first_half = " ".join(row["recognized"] for row in group[: PASSAGE_SENTENCES // 2])
        # Another speaker's sentences, none of them in this passage: texts
        # repeat across SpeechOcean speakers.
        texts = {row["reference"] for row in group}
        others = [row for s in speakers if s != speaker for row in by_speaker[s]
                  if row["reference"] not in texts]
        other_reference = " ".join(
            row["reference"] for row in rng.sample(others, PASSAGE_SENTENCES)
        ).split()
        lengths.append(len(reference))
        own.append(corrected_character_coverage(reference, recognized))
        half.append(corrected_character_coverage(reference, first_half))
        wrong.append(corrected_character_coverage(other_reference, recognized))

    sentences = [corrected_character_coverage(row["reference"].split(), row["recognized"])
                 for row in rows]
    return {
        "passage_sentences": PASSAGE_SENTENCES,
        "draws": PASSAGE_DRAWS,
        "passage_words": _quantiles(lengths),
        "own_passage": _quantiles(own, COVERAGE_CUTS),
        "first_half_read": _quantiles(half, COVERAGE_CUTS),
        "wrong_passage": _quantiles(wrong, COVERAGE_CUTS),
        "own_sentence": _quantiles(sentences, COVERAGE_CUTS),
    }


IDENTITY = {"slope": 1.0, "intercept": 0.0}


def adopted(fitted: dict) -> dict:
    """The fitted map when it lowers the mean absolute error, else the
    identity. Least squares can raise it: word and phone labels pile up at
    the top of their scales, and the fit trades many small errors there for
    fewer large ones."""
    if fitted["mae_after"] < fitted["mae_before"]:
        return {"slope": fitted["slope"], "intercept": fitted["intercept"]}
    return dict(IDENTITY)


def _fit_or_identity(predictions: list[float], labels: list[float]) -> dict:
    """`fit_linear`, or a record that keeps the identity when no increasing
    map exists (word and phone labels pile up at the top of the scale)."""
    try:
        return fit_linear(predictions, labels)
    except ValueError as exc:
        return {**IDENTITY, "pairs": len(predictions), "mae_before": 0.0,
                "mae_after": 0.0, "not_fitted": str(exc)}


def fit(rows: list[dict], *, bundle_id: str) -> tuple[dict, dict]:
    """(calibration file, report)."""
    sentence = {}
    for dimension, key in SENTENCE_DIMENSIONS.items():
        sentence[dimension] = fit_linear(
            [row["sentence_prediction"][key] for row in rows],
            [row["sentence_label"][key] for row in rows],
        )
    words = [word for row in rows for word in row["words"]]
    word = _fit_or_identity([w["prediction"] for w in words], [w["label"] for w in words])
    phones = [pair for w in words for pair in w["phones"]]
    phone = _fit_or_identity([p for p, _ in phones], [label for _, label in phones])

    passages = simulate_passages(rows)
    created = datetime.now(UTC).replace(microsecond=0).isoformat()
    calibration = {
        "bundleId": bundle_id,
        "createdAt": created,
        "fittedOn": f"SpeechOcean762 validation, {len(rows)} recordings, Worker request path",
        "labelScale": {"sentence": SENTENCE_SCALE, "word": WORD_SCALE, "phone": PHONE_SCALE},
        "sentence": {name: adopted(f) for name, f in sentence.items()},
        "word": adopted(word),
        "phone": adopted(phone),
    }
    report = {
        "bundle_id": bundle_id,
        "created_at": created,
        "records": len(rows),
        "sentence": sentence,
        "word": word,
        "phone": phone,
        "content_coverage": passages,
    }
    return calibration, report


# --- passages -------------------------------------------------------------------------


def _pearson(xs: list[float], ys: list[float]) -> float:
    return statistics.correlation(xs, ys) if len(xs) > 2 else float("nan")


def passage_check(
    pipeline: SpeechEvaluationPipeline, records: list[ManifestRecord], corpus_root: Path,
    rows: list[dict],
) -> dict:
    import numpy as np
    import soundfile as sf

    by_id = {row["sample_id"]: row for row in rows}
    by_speaker: dict[str, list[ManifestRecord]] = {}
    for record in records:
        by_speaker.setdefault(record.speaker_id, []).append(record)

    passages, failures = [], []
    for speaker, own in sorted(by_speaker.items()):
        for first in range(0, len(own) - PASSAGE_SENTENCES + 1, PASSAGE_SENTENCES):
            group = own[first:first + PASSAGE_SENTENCES]
            audio = np.concatenate([
                sf.read(corpus_root / r.audio.relative_path, dtype="float32")[0] for r in group
            ])
            buffer = io.BytesIO()
            sf.write(buffer, audio, TARGET_SAMPLE_RATE, format="WAV", subtype="PCM_16")
            text = " ".join(r.text_reference.strip().rstrip(".") + "." for r in group)
            words = [len(normalize_text(r.text_reference).split()) for r in group]

            started = time.perf_counter()
            try:
                result = pipeline.evaluate(buffer.getvalue(), text)
                latency_ms = (time.perf_counter() - started) * 1000
                # The same recording in one pass, as before sentence segmentation.
                waveform = decode_audio(buffer.getvalue(), pipeline.limits)
                encoded = pipeline.encoder.encode(waveform)
                reference_words = normalize_text(text).split()
                alignment = pipeline.aligner.align(
                    waveform.squeeze(0).numpy(), TARGET_SAMPLE_RATE, " ".join(reference_words)
                )
                whole = pipeline.score(waveform, encoded, alignment, reference_words)
            except (AlignmentError, EvaluationError) as exc:
                failures.append({"speaker_id": speaker, "first": first, "error": str(exc)})
                continue
            if result.evidence_status.sentence.status != "available":
                failures.append({"speaker_id": speaker, "first": first,
                                 "error": str(result.evidence_status.sentence.reason)})
                continue

            entry = {"speaker_id": speaker, "age_group": group[0].speaker_age_group,
                     "duration_sec": result.duration_sec, "latency_ms": latency_ms,
                     "segments": result.segment_count,
                     "expected_segments": len(reference_sentences(text)),
                     "evidence": result.evidence_status.sentence.status}
            for key in SENTENCE_DIMENSIONS.values():
                weights = sum(words)
                entry[key] = {
                    "segmented": getattr(result.sentence, key),
                    "whole": getattr(whole.sentence, key),
                    "sentences_alone": sum(
                        by_id[r.sample_id]["sentence_prediction"][key] * n
                        for r, n in zip(group, words)) / weights,
                    "label": sum(float(r.scores["sentence"][key]) * n
                                 for r, n in zip(group, words)) / weights,
                }
            passages.append(entry)
            print(f"{len(passages)} passages scored", flush=True)

    summary = {}
    for key in SENTENCE_DIMENSIONS.values():
        alone = [p[key]["sentences_alone"] for p in passages]
        labels = [p[key]["label"] for p in passages]
        summary[key] = {}
        for way in ("segmented", "whole"):
            values = [p[key][way] for p in passages]
            summary[key][way] = {
                "mean_minus_sentences_alone": statistics.fmean(
                    v - a for v, a in zip(values, alone)),
                "mae_to_sentences_alone": statistics.fmean(
                    abs(v - a) for v, a in zip(values, alone)),
                "mean_minus_label": statistics.fmean(v - y for v, y in zip(values, labels)),
                "pearson_to_label": _pearson(values, labels),
            }
        summary[key]["sentences_alone_pearson_to_label"] = _pearson(alone, labels)
    latencies = sorted(p["latency_ms"] for p in passages)
    return {
        "passages": len(passages),
        "failures": failures,
        "passage_sentences": PASSAGE_SENTENCES,
        "duration_sec": _quantiles([p["duration_sec"] for p in passages]),
        "segmentation_matches_reference": all(
            p["segments"] == p["expected_segments"] for p in passages),
        "summary": summary,
        "latency_ms": {"median": statistics.median(latencies),
                       "p95": latencies[int(0.95 * (len(latencies) - 1))],
                       "max": latencies[-1]},
        "per_passage": passages,
    }


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m echolingo_speech.evaluation.display_calibration"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    collect_parser = commands.add_parser("collect")
    collect_parser.add_argument("--config", type=Path, required=True, help="speech.yaml")
    collect_parser.add_argument("--manifest", type=Path, required=True)
    collect_parser.add_argument("--corpus-root", type=Path, required=True)
    collect_parser.add_argument("--bundle-id", default=None, help="default: worker_bundle_id")
    collect_parser.add_argument("--device", default="cpu")
    collect_parser.add_argument("--limit", type=int, default=None)
    collect_parser.add_argument("--out", type=Path, required=True, help="rows (.jsonl)")
    passages_parser = commands.add_parser("passages")
    passages_parser.add_argument("--config", type=Path, required=True, help="speech.yaml")
    passages_parser.add_argument("--manifest", type=Path, required=True)
    passages_parser.add_argument("--corpus-root", type=Path, required=True)
    passages_parser.add_argument("--rows", type=Path, required=True, help="`collect` output")
    passages_parser.add_argument("--bundle-id", default=None, help="default: worker_bundle_id")
    passages_parser.add_argument("--device", default="cpu")
    passages_parser.add_argument("--out", type=Path, required=True)
    fit_parser = commands.add_parser("fit")
    fit_parser.add_argument("--rows", type=Path, required=True)
    fit_parser.add_argument("--bundle-id", required=True)
    fit_parser.add_argument("--calibration-out", type=Path, required=True)
    fit_parser.add_argument("--report-out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command in ("collect", "passages"):
        from echolingo_speech.config import load_config
        from echolingo_speech.worker.app import build_pipeline, resolve_bundle_dir

        config = load_config(args.config)
        bundle_dir = resolve_bundle_dir(
            config.artifact_root, args.bundle_id or config.worker_bundle_id
        )
        pipeline, _ = build_pipeline(
            bundle_dir=bundle_dir, hf_cache_dir=config.artifact_root / "hf-cache",
            mfa_cache_dir=config.artifact_root / "mfa-cache", device=args.device,
        )
        records = [r for r in read_jsonl(args.manifest) if r.partition == "validation"]
        if args.command == "passages":
            rows = [json.loads(line)
                    for line in args.rows.read_text(encoding="utf-8").splitlines()]
            report = passage_check(pipeline, records, args.corpus_root, rows)
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            print(f"OK: wrote {report['passages']} passages to {args.out}")
            return 0
        records = records[: args.limit] if args.limit else records
        collect(pipeline, records, args.corpus_root, args.out)
        print(f"OK: wrote {len(records)} rows to {args.out}")
        return 0

    rows = [json.loads(line) for line in args.rows.read_text(encoding="utf-8").splitlines()]
    calibration, report = fit(rows, bundle_id=args.bundle_id)
    for path, payload in ((args.calibration_out, calibration), (args.report_out, report)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"OK: wrote {args.calibration_out} and {args.report_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
