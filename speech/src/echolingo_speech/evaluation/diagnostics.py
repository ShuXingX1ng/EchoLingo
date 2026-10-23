"""M2.5 diagnostics for a trained A0 checkpoint (roadmap SS18.3 step 2).

Read-only analysis that changes no model: it explains *why* A0 scores what it
does, so each M2.5 fix can be compared against a fixed reference.

- error detection: confusion matrix at the configured threshold, prediction vs
  label distributions, and threshold-free average precision for the "error"
  class (score = 1 - predicted accuracy);
- loss components: sentence (per dimension), word accuracy, word stress and
  phone terms reported separately, with their share of the total loss;
- mask coverage: how many words/phones actually receive supervision, per
  partition and age group (alignment statistics only, no model outputs);
- age groups: the full SS7.1 metric report per `speaker_age_group`.

Model outputs are only collected on train/validation: the sealed test
partition stays untouched until a candidate is final (roadmap SS18.4).

CLI: `python -m echolingo_speech.evaluation.diagnostics --checkpoint a0-seed42=<best.pt> ...`
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from echolingo_speech.config import load_config
from echolingo_speech.data.manifest import read_jsonl
from echolingo_speech.evaluation.metrics import (
    average_precision,
    error_detection_metrics,
    select_prediction_threshold,
)
from echolingo_speech.evaluation.report import ScorePairs, assemble_metrics
from echolingo_speech.models.scorer import SpeechEvaluatorA0
from echolingo_speech.training.checkpoint import load_model
from echolingo_speech.training.config import TrainingConfig, load_training_config
from echolingo_speech.training.dataset import ScoringExample, SpeechOceanScoringDataset, collate_fn
from echolingo_speech.training.labels import SENTENCE_TARGET_KEYS
from echolingo_speech.training.loop import _move_batch_to_device, resolve_device
from echolingo_speech.training.losses import PHONE_WEIGHT, SENTENCE_WEIGHT, WORD_WEIGHT

DIAGNOSABLE_PARTITIONS = ("train", "validation")
COVERAGE_PARTITIONS = ("train", "validation", "test")
HISTOGRAM_BINS = 10


@dataclass
class RecordOutputs:
    """One utterance's predictions and targets on the [0, 1]-normalized scale."""

    sample_id: str
    age_group: str
    sentence_preds: list[float]
    sentence_targets: list[float]
    word_alignment_valid: bool
    word_preds: list[float] = field(default_factory=list)
    word_targets: list[float] = field(default_factory=list)
    stress_logits: list[float] = field(default_factory=list)
    stress_targets: list[float] = field(default_factory=list)
    phone_preds: list[float] = field(default_factory=list)
    phone_targets: list[float] = field(default_factory=list)


@torch.no_grad()
def collect_outputs(
    model: SpeechEvaluatorA0,
    examples: Sequence[ScoringExample],
    age_groups: dict[str, str],
    device: str,
    batch_size: int = 32,
) -> list[RecordOutputs]:
    model.eval()
    loader = DataLoader(list(examples), batch_size=batch_size, shuffle=False, collate_fn=collate_fn)
    outputs: list[RecordOutputs] = []
    for batch in loader:
        predictions = model(_move_batch_to_device(batch, device))
        sentence_scores = predictions["sentence_scores"].cpu()
        for b, sample_id in enumerate(batch["sample_ids"]):
            word_examples = batch["word_examples"][b]
            phone_examples = batch["phone_examples"][b]
            outputs.append(
                RecordOutputs(
                    sample_id=sample_id,
                    age_group=age_groups.get(sample_id, "unknown"),
                    sentence_preds=sentence_scores[b].tolist(),
                    sentence_targets=batch["sentence_targets"][b].tolist(),
                    word_alignment_valid=batch["word_alignment_valid"][b],
                    word_preds=predictions["word_accuracy"][b].cpu().tolist(),
                    word_targets=[example.accuracy for example in word_examples],
                    stress_logits=predictions["word_stress_logit"][b].cpu().tolist(),
                    stress_targets=[example.stress for example in word_examples],
                    phone_preds=predictions["phone_accuracy"][b].cpu().tolist(),
                    phone_targets=[example.accuracy for example in phone_examples],
                )
            )
    return outputs


def score_pairs(records: Sequence[RecordOutputs]) -> ScorePairs:
    """Same filtering as `training/loop.py::evaluate`, so metrics match it."""
    pairs = ScorePairs()
    for record in records:
        for i, key in enumerate(SENTENCE_TARGET_KEYS):
            pairs.sentence_preds[key].append(record.sentence_preds[i])
            pairs.sentence_targets[key].append(record.sentence_targets[i])
        if record.word_alignment_valid and record.word_targets:
            pairs.word_accuracy_preds.extend(record.word_preds)
            pairs.word_accuracy_targets.extend(record.word_targets)
        if record.phone_targets:
            pairs.phone_accuracy_preds.extend(record.phone_preds)
            pairs.phone_accuracy_targets.extend(record.phone_targets)
    return pairs


def distribution(values: Sequence[float], threshold: float) -> dict:
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return {"n": 0}
    counts, _ = np.histogram(arr, bins=HISTOGRAM_BINS, range=(0.0, 1.0))
    p05, p25, p50, p75, p95 = np.percentile(arr, [5, 25, 50, 75, 95])
    return {
        "n": int(arr.size),
        "mean": float(arr.mean()),
        "std": float(arr.std()),
        "min": float(arr.min()),
        "p05": float(p05),
        "p25": float(p25),
        "p50": float(p50),
        "p75": float(p75),
        "p95": float(p95),
        "max": float(arr.max()),
        "fraction_below_threshold": float(np.mean(arr < threshold)),
        "histogram": counts.tolist(),
    }


def confusion_matrix(preds: Sequence[float], targets: Sequence[float], threshold: float) -> dict:
    """Counts for the "error" class (score below `threshold`)."""
    pred_error = np.asarray(preds, dtype=float) < threshold
    target_error = np.asarray(targets, dtype=float) < threshold
    return {
        "true_error": int(np.sum(pred_error & target_error)),
        "false_error": int(np.sum(pred_error & ~target_error)),
        "missed_error": int(np.sum(~pred_error & target_error)),
        "true_correct": int(np.sum(~pred_error & ~target_error)),
    }


def error_detection_diagnostics(
    preds: Sequence[float], targets: Sequence[float], threshold: float
) -> dict:
    """`best_threshold_on_this_partition` is chosen and scored on the same
    examples: it shows how much signal the fixed threshold hides, and is an
    optimistic upper bound, not a tuned setting.
    """
    preds, targets = list(preds), list(targets)
    best_cut = select_prediction_threshold(preds, targets, threshold)
    return {
        "at_threshold": error_detection_metrics(preds, targets, threshold),
        "confusion": confusion_matrix(preds, targets, threshold),
        "average_precision": average_precision(preds, targets, threshold),
        "chance_average_precision": (
            float(np.mean([target < threshold for target in targets])) if targets else 0.0
        ),
        "best_threshold_on_this_partition": {
            "threshold": best_cut,
            "macro_f1": error_detection_metrics(preds, targets, threshold, best_cut)["macro_f1"],
        },
        "prediction_distribution": distribution(preds, threshold),
        "label_distribution": distribution(targets, threshold),
    }


def loss_components(records: Sequence[RecordOutputs]) -> dict:
    """Each term reduced exactly as `training/losses.py` reduces it, but over
    the whole partition and without summing the word terms together.
    """
    sentence_preds = torch.tensor([record.sentence_preds for record in records])
    sentence_targets = torch.tensor([record.sentence_targets for record in records])
    sentence_terms = {
        key: float(F.huber_loss(sentence_preds[:, i], sentence_targets[:, i]))
        for i, key in enumerate(SENTENCE_TARGET_KEYS)
    }
    sentence = float(F.huber_loss(sentence_preds, sentence_targets))

    accuracy_terms, stress_terms = [], []
    for record in records:
        if not record.word_alignment_valid or not record.word_targets:
            continue
        accuracy_terms.append(
            float(F.huber_loss(torch.tensor(record.word_preds), torch.tensor(record.word_targets)))
        )
        stress_terms.append(
            float(
                F.binary_cross_entropy_with_logits(
                    torch.tensor(record.stress_logits), torch.tensor(record.stress_targets)
                )
            )
        )
    word_accuracy = float(np.mean(accuracy_terms)) if accuracy_terms else 0.0
    word_stress = float(np.mean(stress_terms)) if stress_terms else 0.0

    phone_preds = [pred for record in records for pred in record.phone_preds]
    phone_targets = [target for record in records for target in record.phone_targets]
    phone = (
        float(F.huber_loss(torch.tensor(phone_preds), torch.tensor(phone_targets)))
        if phone_preds
        else 0.0
    )

    weighted = {
        "sentence": SENTENCE_WEIGHT * sentence,
        "word_accuracy": WORD_WEIGHT * word_accuracy / 2,
        "word_stress": WORD_WEIGHT * word_stress / 2,
        "phone": PHONE_WEIGHT * phone,
    }
    total = sum(weighted.values())
    return {
        "sentence": sentence,
        "sentence_by_dimension": sentence_terms,
        "word_accuracy_huber": word_accuracy,
        "word_stress_bce": word_stress,
        "phone_huber": phone,
        "weighted_contribution": weighted,
        "share_of_total": {key: value / total if total else 0.0 for key, value in weighted.items()},
        "total": total,
    }


def mask_coverage(
    examples: Sequence[ScoringExample], canonical_counts: dict[str, tuple[int, int]]
) -> dict:
    """`canonical_counts[sample_id]` is (reference words, canonical phones)."""
    canonical_words = sum(canonical_counts[example.sample_id][0] for example in examples)
    canonical_phones = sum(canonical_counts[example.sample_id][1] for example in examples)
    supervised_words = sum(len(example.word_examples) for example in examples)
    supervised_phones = sum(len(example.phone_examples) for example in examples)
    return {
        "records": len(examples),
        "records_with_valid_word_alignment": sum(
            1 for example in examples if example.word_alignment_valid
        ),
        "canonical_words": canonical_words,
        "supervised_words": supervised_words,
        "word_coverage": supervised_words / canonical_words if canonical_words else 0.0,
        "canonical_phones": canonical_phones,
        "supervised_phones": supervised_phones,
        "phone_coverage": supervised_phones / canonical_phones if canonical_phones else 0.0,
    }


def diagnose_records(records: Sequence[RecordOutputs], training_config: TrainingConfig) -> dict:
    threshold = training_config.error_detection_threshold

    def metrics_for(subset: Sequence[RecordOutputs]) -> dict:
        return assemble_metrics(
            score_pairs(subset),
            score_band_width=training_config.score_band_width,
            error_detection_threshold=threshold,
        )

    pairs = score_pairs(records)
    by_age_group = {}
    for group in sorted({record.age_group for record in records}):
        group_records = [record for record in records if record.age_group == group]
        by_age_group[group] = {"records": len(group_records), "metrics": metrics_for(group_records)}
    return {
        "records": len(records),
        "metrics": metrics_for(records),
        "word_error_detection": error_detection_diagnostics(
            pairs.word_accuracy_preds, pairs.word_accuracy_targets, threshold
        ),
        "phone_error_detection": error_detection_diagnostics(
            pairs.phone_accuracy_preds, pairs.phone_accuracy_targets, threshold
        ),
        "loss_components": loss_components(records),
        "by_age_group": by_age_group,
    }


def _canonical_counts(record) -> tuple[int, int]:
    words = record.scores["words"]
    return len(words), sum(len(word["phones"]) for word in words)


def _summary_markdown(report: dict) -> str:
    lines = [f"# A0 diagnostics ({report['partition']})", "", "## Mask coverage", ""]
    lines.append("| partition | group | records | valid word alignment | words | phones |")
    lines.append("|---|---|---|---|---|---|")
    for partition, groups in report["mask_coverage"].items():
        for group, cov in groups.items():
            lines.append(
                f"| {partition} | {group} | {cov['records']} | "
                f"{cov['records_with_valid_word_alignment']} | {cov['word_coverage']:.3f} | "
                f"{cov['phone_coverage']:.3f} |"
            )
    for name, run in report["runs"].items():
        lines += ["", f"## {name}", ""]
        for level in ("word", "phone"):
            diag = run[f"{level}_error_detection"]
            c = diag["confusion"]
            pred, label = diag["prediction_distribution"], diag["label_distribution"]
            best = diag["best_threshold_on_this_partition"]
            lines.append(
                f"- {level}: macro F1 {diag['at_threshold']['macro_f1']:.4f}; confusion "
                f"true_error={c['true_error']} false_error={c['false_error']} "
                f"missed_error={c['missed_error']} true_correct={c['true_correct']}; "
                f"AP {diag['average_precision']:.3f} "
                f"(chance {diag['chance_average_precision']:.3f}); "
                f"min/p05/p50 pred {pred['min']:.3f}/{pred['p05']:.3f}/{pred['p50']:.3f} "
                f"vs label {label['min']:.3f}/{label['p05']:.3f}/{label['p50']:.3f}; "
                f"below threshold pred {pred['fraction_below_threshold']:.3f} "
                f"vs label {label['fraction_below_threshold']:.3f}; "
                f"best threshold here {best['threshold']:.3f} -> macro F1 {best['macro_f1']:.4f}"
            )
        losses = run["loss_components"]
        shares = ", ".join(f"{key} {value:.2f}" for key, value in losses["share_of_total"].items())
        lines.append(
            f"- losses: word accuracy Huber {losses['word_accuracy_huber']:.4f}, "
            f"word stress BCE {losses['word_stress_bce']:.4f}, "
            f"phone Huber {losses['phone_huber']:.4f}, sentence Huber {losses['sentence']:.4f}; "
            f"share of total: {shares}"
        )
        for group, data in run["by_age_group"].items():
            m = data["metrics"]
            lines.append(
                f"- {group} ({data['records']}): sentence accuracy Pearson "
                f"{m['sentence_accuracy_pearson']:.3f}, "
                f"fluency {m['sentence_fluency_pearson']:.3f}, "
                f"word accuracy {m.get('word_accuracy_pearson', float('nan')):.3f}, "
                f"phone accuracy {m.get('phone_accuracy_pearson', float('nan')):.3f}"
            )
    return "\n".join(lines) + "\n"


def _parse_checkpoint(value: str) -> tuple[str, Path]:
    name, sep, path = value.partition("=")
    if not sep or not name or not path:
        raise argparse.ArgumentTypeError("expected NAME=PATH, e.g. a0-seed42=.../best.pt")
    return name, Path(path)


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.evaluation.diagnostics")
    parser.add_argument("--config", type=Path, required=True, help="path to speech.yaml")
    parser.add_argument("--training-config", type=Path, required=True, help="path to a0.yaml")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument(
        "--checkpoint",
        type=_parse_checkpoint,
        action="append",
        required=True,
        help="NAME=PATH; repeat for several runs",
    )
    parser.add_argument("--partition", choices=DIAGNOSABLE_PARTITIONS, default="validation")
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--device", default=None, help="e.g. cuda, cpu (default: auto)")
    args = parser.parse_args(argv)

    speech_config = load_config(args.config)
    training_config = load_training_config(args.training_config)
    processed_root = speech_config.data_root / "processed" / "speechocean762"
    device = resolve_device(args.device)

    manifest = read_jsonl(args.manifest)
    age_groups = {record.sample_id: record.speaker_age_group for record in manifest}
    counts = {record.sample_id: _canonical_counts(record) for record in manifest}

    datasets = {
        partition: SpeechOceanScoringDataset(args.manifest, processed_root, partition)
        for partition in COVERAGE_PARTITIONS
    }
    coverage = {}
    for partition, dataset in datasets.items():
        examples = dataset.examples
        coverage[partition] = {"all": mask_coverage(examples, counts)}
        for group in sorted({age_groups[example.sample_id] for example in examples}):
            group_examples = [e for e in examples if age_groups[e.sample_id] == group]
            coverage[partition][group] = mask_coverage(group_examples, counts)

    runs = {}
    for name, checkpoint_path in args.checkpoint:
        model = load_model(checkpoint_path, device)
        records = collect_outputs(
            model,
            datasets[args.partition].examples,
            age_groups,
            device,
            batch_size=training_config.batch_size,
        )
        runs[name] = diagnose_records(records, training_config)

    report = {
        "partition": args.partition,
        "error_detection_threshold": training_config.error_detection_threshold,
        "checkpoints": {name: str(path) for name, path in args.checkpoint},
        "mask_coverage": coverage,
        "runs": runs,
    }
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "diagnostics.json").write_text(json.dumps(report, indent=2) + "\n")
    summary = _summary_markdown(report)
    (args.out_dir / "summary.md").write_text(summary)
    print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
