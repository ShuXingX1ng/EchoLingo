"""M4 acceptance: does the Worker reproduce the bundle's validation scores?

Every validation recording is scored twice with the bundle's scorer, both
times through the Worker's own decoding and encoder (`worker/pipeline.py`):

- `training_alignment`: the corpus-level MFA TextGrids and SpeechOcean's
  canonical phones that training used, through `training/dataset.py`'s
  matching. Any gap to the bundle's recorded validation metrics comes from
  the Worker's audio/encoder path (or CPU vs GPU arithmetic).
- `worker`: the full request path, `mfa align_one` per recording and the
  dictionary pronunciation as canonical phones. The gap to
  `training_alignment` is what serving costs. Words and phones are scored
  against the official labels only where the Worker's word/phone counts
  match them, the rule training evaluation used.

It also records how much of the reference the free ASR heard (by words and
by letters), for the real reference and for another validation sentence (a
wrong passage), which is how the `reference_not_read` cut was chosen, and
per-stage latency. Validation only: the
sealed test stays sealed.

CLI: `python -m echolingo_speech.evaluation.worker_parity --config ... --out report.json`
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from dataclasses import replace
from pathlib import Path

import torch

from echolingo_speech.alignment.mfa import normalize_text, parse_textgrid_spans
from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.evaluation.report import ScorePairs, assemble_metrics
from echolingo_speech.features.acoustic import compute_acoustic_features, feature_vector
from echolingo_speech.features.cache import TARGET_SAMPLE_RATE
from echolingo_speech.training.dataset import _match_words_and_phones
from echolingo_speech.training.labels import (
    PHONE_SCALE,
    SENTENCE_SCALE,
    SENTENCE_TARGET_KEYS,
    WORD_SCALE,
    normalize_phone_accuracy,
    normalize_sentence_scores,
    normalize_word_score,
)
from echolingo_speech.worker.aligner import AlignmentError
from echolingo_speech.worker.pipeline import (
    EncodedAudio,
    SpeechEvaluationPipeline,
    decode_audio,
    reference_character_coverage,
    reference_coverage,
)
from echolingo_speech.worker.schema import EvaluationResult

COVERAGE_CUTS = (0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4)


def _add_sentence(pairs: ScorePairs, predicted: list[float], record: ManifestRecord) -> None:
    targets = normalize_sentence_scores(record.scores["sentence"])
    for key, value in zip(SENTENCE_TARGET_KEYS, predicted):
        pairs.sentence_preds[key].append(value)
        pairs.sentence_targets[key].append(targets[key])


@torch.no_grad()
def score_training_alignment(
    pipeline: SpeechEvaluationPipeline,
    record: ManifestRecord,
    waveform: torch.Tensor,
    encoded: EncodedAudio,
    textgrid: Path,
    pairs: ScorePairs,
) -> None:
    """Score `record` as training evaluation did (its TextGrid, SpeechOcean
    canonical phones, official labels) on the Worker's encoder output."""
    word_spans, phone_spans = parse_textgrid_spans(textgrid)
    num_frames = encoded.hidden_states.shape[-2]
    duration = record.audio.duration_sec
    words, phones, valid = _match_words_and_phones(
        word_spans, phone_spans, record.scores["words"], duration, num_frames
    )
    acoustic = compute_acoustic_features(
        waveform, word_spans, duration_sec=duration,
        reference_word_count=len(record.scores["words"]),
    )
    device = next(pipeline.bundle.model.parameters()).device
    outputs = pipeline.bundle.model({
        "hidden_states": encoded.hidden_states.unsqueeze(0).to(device),
        "frame_mask": torch.ones(1, num_frames, dtype=torch.bool, device=device),
        "acoustic_features": torch.tensor(
            [feature_vector(acoustic)], dtype=torch.float32, device=device
        ),
        "word_examples": [words],
        "phone_examples": [phones],
    })
    _add_sentence(pairs, outputs["sentence_scores"][0].cpu().tolist(), record)
    if valid and words:
        pairs.word_accuracy_preds.extend(outputs["word_accuracy"][0].cpu().tolist())
        pairs.word_accuracy_targets.extend(word.accuracy for word in words)
    pairs.phone_accuracy_preds.extend(outputs["phone_accuracy"][0].cpu().tolist())
    pairs.phone_accuracy_targets.extend(phone.accuracy for phone in phones)


def add_worker_result(
    result: EvaluationResult, record: ManifestRecord, pairs: ScorePairs, counts: dict
) -> None:
    """Pair a Worker result with the official labels: every sentence; each
    scored word by position; a word's phonemes only when MFA gave it as many
    phones as SpeechOcean's canonical list."""
    _add_sentence(
        pairs,
        [getattr(result.sentence, key) / SENTENCE_SCALE for key in SENTENCE_TARGET_KEYS],
        record,
    )
    for level, evidence in result.evidence_status.model_dump().items():
        key = ":".join(part for part in (level, evidence["status"], evidence["reason"]) if part)
        counts["evidence"][key] = counts["evidence"].get(key, 0) + 1
    labels = record.scores["words"]
    for word in result.words:
        if word.status != "scored":
            counts["out_of_vocabulary_words"] += 1
            continue
        label = labels[word.index]
        pairs.word_accuracy_preds.append(word.accuracy / WORD_SCALE)
        pairs.word_accuracy_targets.append(normalize_word_score(label)["accuracy"])
        if len(word.phonemes) != len(label["phones"]):
            counts["phone_count_mismatch_words"] += 1
            continue
        for phoneme, target in zip(word.phonemes, label["phones-accuracy"]):
            pairs.phone_accuracy_preds.append(phoneme.accuracy / PHONE_SCALE)
            pairs.phone_accuracy_targets.append(normalize_phone_accuracy(target))


def wrong_reference(records: list[ManifestRecord], index: int) -> str:
    """The next record's sentence with a different text (texts repeat
    across speakers): a recording paired with the wrong passage."""
    own = normalize_text(records[index].text_reference)
    for step in range(1, len(records)):
        other = normalize_text(records[(index + step) % len(records)].text_reference)
        if other != own:
            return other
    raise ValueError("every record has the same text")


def _distribution(values: list[float]) -> dict:
    ordered = sorted(values)
    return {
        "min": ordered[0],
        "p01": ordered[int(0.01 * (len(ordered) - 1))],
        "p05": ordered[int(0.05 * (len(ordered) - 1))],
        "median": statistics.median(ordered),
        "max": ordered[-1],
        "share_below": {
            str(cut): sum(value < cut for value in ordered) / len(ordered)
            for cut in COVERAGE_CUTS
        },
    }


def _latency(values: list[float]) -> dict:
    ordered = sorted(values)
    return {
        "median_ms": statistics.median(ordered),
        "p95_ms": ordered[int(0.95 * (len(ordered) - 1))],
        "max_ms": ordered[-1],
    }


def run_parity(
    pipeline: SpeechEvaluationPipeline,
    records: list[ManifestRecord],
    *,
    corpus_root: Path,
    textgrid_root: Path,
    error_detection_threshold: float,
    score_band_width: float,
    log_every: int = 20,
) -> dict:
    # The coverage gate is measured here, not applied: every record keeps
    # its word evidence.
    gate = pipeline.limits.min_reference_character_coverage
    pipeline = SpeechEvaluationPipeline(
        pipeline.bundle, pipeline.encoder, pipeline.aligner,
        replace(pipeline.limits, min_reference_character_coverage=0.0),
    )
    training_pairs, worker_pairs = ScorePairs(), ScorePairs()
    counts = {"evidence": {}, "out_of_vocabulary_words": 0, "phone_count_mismatch_words": 0}
    coverage: dict[str, list[float]] = {
        f"{unit}_{reference}": [] for unit in ("word", "character")
        for reference in ("own_reference", "wrong_reference")
    }
    latency: dict[str, list[float]] = {
        stage: [] for stage in ("decode", "encoder", "alignment", "scoring", "total")
    }

    for index, record in enumerate(records):
        started = time.perf_counter()
        audio = (corpus_root / record.audio.relative_path).read_bytes()
        waveform = decode_audio(audio, pipeline.limits)
        decoded = time.perf_counter()
        encoded = pipeline.encoder.encode(waveform)
        encoded_at = time.perf_counter()
        reference_words = normalize_text(record.text_reference).split()
        try:
            alignment = pipeline.aligner.align(
                waveform.squeeze(0).numpy(), TARGET_SAMPLE_RATE, " ".join(reference_words)
            )
        except AlignmentError:
            alignment = None
        aligned_at = time.perf_counter()
        result = pipeline.score(waveform, encoded, alignment, reference_words)
        finished = time.perf_counter()
        marks = {
            "decode": (started, decoded), "encoder": (decoded, encoded_at),
            "alignment": (encoded_at, aligned_at), "scoring": (aligned_at, finished),
            "total": (started, finished),
        }
        for stage, (start, end) in marks.items():
            latency[stage].append((end - start) * 1000)

        add_worker_result(result, record, worker_pairs, counts)
        textgrid = textgrid_root / f"SPEAKER{record.speaker_id}" / f"{record.sample_id}.TextGrid"
        score_training_alignment(pipeline, record, waveform, encoded, textgrid, training_pairs)

        recognized = encoded.recognized_text
        for reference, words in (
            ("own_reference", reference_words),
            ("wrong_reference", wrong_reference(records, index).split()),
        ):
            coverage[f"word_{reference}"].append(reference_coverage(words, recognized.split()))
            coverage[f"character_{reference}"].append(
                reference_character_coverage(words, recognized)
            )
        if log_every and (index + 1) % log_every == 0:
            print(f"{index + 1}/{len(records)} scored", flush=True)

    metric_args = {
        "score_band_width": score_band_width,
        "error_detection_threshold": error_detection_threshold,
        "prediction_thresholds": pipeline.bundle.prediction_thresholds,
    }
    return {
        "records": len(records),
        "training_alignment": assemble_metrics(training_pairs, **metric_args),
        "worker": assemble_metrics(worker_pairs, **metric_args),
        "worker_counts": counts,
        "scored_pairs": {
            name: {"words": len(pairs.word_accuracy_preds),
                   "phones": len(pairs.phone_accuracy_preds)}
            for name, pairs in (("training_alignment", training_pairs), ("worker", worker_pairs))
        },
        "reference_coverage": {key: _distribution(values) for key, values in coverage.items()},
        "reference_not_read_gate": {
            "min_reference_character_coverage": gate,
            "own_reference_withheld": sum(v < gate for v in coverage["character_own_reference"]),
            "wrong_reference_withheld": sum(
                v < gate for v in coverage["character_wrong_reference"]
            ),
        },
        "latency_ms": {stage: _latency(values) for stage, values in latency.items()},
    }


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.evaluation.worker_parity")
    parser.add_argument("--config", type=Path, required=True, help="speech.yaml")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument(
        "--textgrid-root", type=Path, required=True,
        help="the corpus-level MFA output training used (mfa-output/)",
    )
    parser.add_argument("--bundle-id", default=None, help="default: worker_bundle_id")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--limit", type=int, default=None, help="first N records (smoke runs)")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    from echolingo_speech.bundles.bundle import TRAINING_MANIFEST_NAME
    from echolingo_speech.worker.app import build_pipeline, resolve_bundle_dir

    config = load_config(args.config)
    bundle_dir = resolve_bundle_dir(config.artifact_root, args.bundle_id or config.worker_bundle_id)
    pipeline, health = build_pipeline(
        bundle_dir=bundle_dir, hf_cache_dir=config.artifact_root / "hf-cache",
        mfa_cache_dir=config.artifact_root / "mfa-cache", device=args.device,
    )
    training_config = json.loads(
        (bundle_dir / TRAINING_MANIFEST_NAME).read_text(encoding="utf-8")
    )["training_config"]
    records = [record for record in read_jsonl(args.manifest)
               if record.partition == "validation"]
    records = records[: args.limit] if args.limit else records
    report = run_parity(
        pipeline, records, corpus_root=args.corpus_root, textgrid_root=args.textgrid_root,
        error_detection_threshold=training_config["error_detection_threshold"],
        score_band_width=training_config["score_band_width"],
    )
    report.update(
        bundle_id=pipeline.bundle.bundle_id, partition="validation",
        aligner_version=health["aligner_version"], device=args.device,
        torch_version=torch.__version__,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"OK: wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
