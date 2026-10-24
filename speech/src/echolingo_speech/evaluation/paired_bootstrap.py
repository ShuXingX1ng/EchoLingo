"""Is a candidate really better than a reference? (M3 adult target domain)

Validation has only 13 speakers (7 adult), so a metric difference between two
checkpoints can come from which speakers happen to be in it. This resamples
*speakers* with replacement, recomputes each metric for both checkpoints on
the same resample, and reports the candidate-minus-reference difference with
a percentile interval. Records are paired by sample id, so both checkpoints
are always scored on exactly the same words and phones.

Validation or train only; the sealed test stays untouched (roadmap SS18.4).

CLI: `python -m echolingo_speech.evaluation.paired_bootstrap --config ...
  --training-config ... --manifest ... --reference a0ama-seed42=<best.pt>
  --candidate a0amaft-seed42=<best.pt> --age-group adult [--feature-variant ...]`
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import read_jsonl
from echolingo_speech.evaluation.metrics import average_precision, pearson_correlation
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.checkpoint import load_model
from echolingo_speech.training.config import TrainingConfig, load_training_config
from echolingo_speech.training.labels import SENTENCE_TARGET_KEYS
from echolingo_speech.training.loop import _move_batch_to_device, _partition_loader, resolve_device

BOOTSTRAP_PARTITIONS = ("train", "validation")
SENTENCE_KEYS = ("accuracy", "fluency", "prosodic")


@dataclass
class RecordOutputs:
    """One record's mask-valid predictions and targets (all on [0, 1])."""

    sentence_preds: dict[str, float]
    sentence_targets: dict[str, float]
    word_preds: list[float] = field(default_factory=list)
    word_targets: list[float] = field(default_factory=list)
    phone_preds: list[float] = field(default_factory=list)
    phone_targets: list[float] = field(default_factory=list)


@torch.no_grad()
def collect_record_outputs(
    model: SpeechEvaluatorA0, loader: DataLoader, device: str
) -> dict[str, RecordOutputs]:
    """Per-record outputs keyed by sample id, with the same mask-valid
    selection as `training/loop.py::_score_pass`."""
    model.eval()
    outputs: dict[str, RecordOutputs] = {}
    for batch in loader:
        batch = _move_batch_to_device(batch, device)
        predictions = model(batch)
        scores = predictions["sentence_scores"].cpu()
        targets = batch["sentence_targets"].cpu()
        for b, sample_id in enumerate(batch["sample_ids"]):
            record = RecordOutputs(
                sentence_preds={
                    key: scores[b, i].item() for i, key in enumerate(SENTENCE_TARGET_KEYS)
                },
                sentence_targets={
                    key: targets[b, i].item() for i, key in enumerate(SENTENCE_TARGET_KEYS)
                },
            )
            words = batch["word_examples"][b]
            if batch["word_alignment_valid"][b] and words:
                record.word_preds = predictions["word_accuracy"][b].cpu().tolist()
                record.word_targets = [example.accuracy for example in words]
            phones = batch["phone_examples"][b]
            if phones:
                record.phone_preds = predictions["phone_accuracy"][b].cpu().tolist()
                record.phone_targets = [example.accuracy for example in phones]
            outputs[sample_id] = record
    return outputs


def _metric_functions(
    error_threshold: float,
) -> dict[str, Callable[[list[RecordOutputs]], float]]:
    def sentence(key: str) -> Callable[[list[RecordOutputs]], float]:
        return lambda records: pearson_correlation(
            [r.sentence_preds[key] for r in records], [r.sentence_targets[key] for r in records]
        )

    def flat(records: list[RecordOutputs], level: str) -> tuple[list[float], list[float]]:
        preds = [p for r in records for p in getattr(r, f"{level}_preds")]
        targets = [t for r in records for t in getattr(r, f"{level}_targets")]
        return preds, targets

    functions: dict[str, Callable[[list[RecordOutputs]], float]] = {
        f"sentence_{key}_pearson": sentence(key) for key in SENTENCE_KEYS
    }
    for level in ("word", "phone"):
        functions[f"{level}_accuracy_pearson"] = (
            lambda records, level=level: pearson_correlation(*flat(records, level))
        )
        functions[f"{level}_error_average_precision"] = (
            lambda records, level=level: average_precision(*flat(records, level), error_threshold)
        )
    return functions


def paired_bootstrap(
    reference: dict[str, RecordOutputs],
    candidate: dict[str, RecordOutputs],
    speakers: dict[str, str],
    *,
    error_threshold: float = 0.6,
    resamples: int = 1000,
    seed: int = 0,
) -> dict[str, dict[str, float]]:
    """Candidate-minus-reference difference per metric: the point estimate on
    all records, the 2.5/97.5 percentiles over `resamples` speaker
    resamples, and the share of resamples where the candidate is better."""
    if reference.keys() != candidate.keys():
        raise ValueError("reference and candidate were scored on different records")
    by_speaker: dict[str, list[str]] = {}
    for sample_id in sorted(reference):
        by_speaker.setdefault(speakers[sample_id], []).append(sample_id)
    speaker_ids = sorted(by_speaker)
    functions = _metric_functions(error_threshold)
    rng = np.random.default_rng(seed)

    def scores(sample_ids: list[str]) -> dict[str, float]:
        ref = [reference[s] for s in sample_ids]
        cand = [candidate[s] for s in sample_ids]
        return {name: fn(cand) - fn(ref) for name, fn in functions.items()}

    point = scores([s for speaker in speaker_ids for s in by_speaker[speaker]])
    draws: dict[str, list[float]] = {name: [] for name in functions}
    for _ in range(resamples):
        chosen = rng.choice(len(speaker_ids), size=len(speaker_ids), replace=True)
        sample_ids = [s for index in chosen for s in by_speaker[speaker_ids[index]]]
        for name, value in scores(sample_ids).items():
            draws[name].append(value)

    result = {}
    for name, values in draws.items():
        values_array = np.asarray(values)
        result[name] = {
            "difference": point[name],
            "ci_low": float(np.percentile(values_array, 2.5)),
            "ci_high": float(np.percentile(values_array, 97.5)),
            "share_better": float(np.mean(values_array > 0)),
        }
    result["_meta"] = {
        "speakers": len(speaker_ids),
        "records": len(reference),
        "resamples": resamples,
    }
    return result


def _named_path(value: str) -> tuple[str, Path]:
    name, _, path = value.partition("=")
    if not path:
        raise argparse.ArgumentTypeError("expected name=path/to/best.pt")
    return name, Path(path)


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.evaluation.paired_bootstrap")
    parser.add_argument("--config", type=Path, required=True, help="path to speech.yaml")
    parser.add_argument("--training-config", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--reference", type=_named_path, required=True)
    parser.add_argument("--candidate", type=_named_path, required=True)
    parser.add_argument("--partition", choices=BOOTSTRAP_PARTITIONS, default="validation")
    parser.add_argument("--age-group", choices=("adult", "child"), default=None)
    parser.add_argument("--feature-variant", default=None)
    parser.add_argument("--resamples", type=int, default=1000)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--device", default=None)
    args = parser.parse_args(argv)

    speech_config = load_config(args.config)
    training_config: TrainingConfig = load_training_config(args.training_config)
    processed_root = speech_config.data_root / "processed" / "speechocean762"
    device = resolve_device(args.device)
    loader = _partition_loader(
        args.manifest, processed_root, args.partition, training_config.batch_size, shuffle=False,
        hidden_state_layers=training_config.hidden_state_layers,
        feature_variant=args.feature_variant,
        age_groups=[args.age_group] if args.age_group else None,
    )
    speakers = {record.sample_id: record.speaker_id for record in read_jsonl(args.manifest)}
    (reference_name, reference_path), (candidate_name, candidate_path) = (
        args.reference, args.candidate
    )
    reference = collect_record_outputs(load_model(reference_path, device), loader, device)
    candidate = collect_record_outputs(load_model(candidate_path, device), loader, device)
    result = paired_bootstrap(
        reference, candidate, speakers,
        error_threshold=training_config.error_detection_threshold,
        resamples=args.resamples,
    )
    result["_meta"].update(
        {
            "reference": reference_name,
            "candidate": candidate_name,
            "partition": args.partition,
            "age_group": args.age_group,
            "feature_variant": args.feature_variant,
        }
    )
    print(f"{candidate_name} - {reference_name} ({result['_meta']})")
    for name, row in result.items():
        if name != "_meta":
            print(
                f"{name:34s} {row['difference']:+.4f}  "
                f"95% [{row['ci_low']:+.4f}, {row['ci_high']:+.4f}]  "
                f"better {row['share_better']:.2f}"
            )
    if args.out is not None:
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
