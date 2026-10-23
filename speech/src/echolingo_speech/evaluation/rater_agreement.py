"""How well a single SpeechOcean762 expert agrees with the others (M3 A0-Rater).

Each of the five experts is scored as if it were a model: its scores against
the aggregate of the *other four*, using the same aggregation the official
labels use (median for sentence and word, mean for phone) and the same
metrics as `evaluation/report.py`. The mean over the five is a human
reference for the scorer's numbers. Leaving the expert out keeps it from
agreeing with itself; a model is scored against all five, so this reference
is slightly conservative. It reads labels only, over every word and phone,
not just the mask-valid ones the scorer is evaluated on.

CLI: `python -m echolingo_speech.evaluation.rater_agreement
  --manifest ... --partition validation [--out agreement.json]`
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from echolingo_speech.data.manifest import ManifestRecord, read_jsonl
from echolingo_speech.evaluation.metrics import error_detection_metrics, pearson_correlation
from echolingo_speech.training.labels import PHONE_SCALE, SENTENCE_SCALE, WORD_SCALE

SENTENCE_KEYS = ("accuracy", "fluency", "prosodic")
ERROR_DETECTION_THRESHOLD = 0.6


def _leave_one_out(
    rows: list[list[float]], rater: int, aggregate, scale: float
) -> tuple[list[float], list[float]]:
    """(that expert's scores, the other experts' aggregate), both / `scale`."""
    own = [row[rater] / scale for row in rows]
    others = [aggregate(row[:rater] + row[rater + 1 :]) / scale for row in rows]
    return own, others


def rater_agreement(records: list[ManifestRecord]) -> dict[str, float]:
    sentence_rows: dict[str, list[list[float]]] = {key: [] for key in SENTENCE_KEYS}
    word_rows: list[list[float]] = []
    phone_rows: list[list[float]] = []
    for record in records:
        raters = record.scores.get("raters")
        if raters is None:
            raise ValueError(f"{record.sample_id} has no rater scores (run `attach-raters`)")
        for key in SENTENCE_KEYS:
            sentence_rows[key].append(raters["sentence"][key])
        for word in raters["words"]:
            word_rows.append(word["accuracy"])
            phone_rows.extend(word["phones-accuracy"])

    rater_count = len(word_rows[0]) if word_rows else 0
    per_rater: dict[str, list[float]] = {}

    def add(name: str, value: float) -> None:
        per_rater.setdefault(name, []).append(value)

    for rater in range(rater_count):
        for key in SENTENCE_KEYS:
            own, others = _leave_one_out(
                sentence_rows[key], rater, statistics.median, SENTENCE_SCALE
            )
            add(f"sentence_{key}_pearson", pearson_correlation(own, others))
        for level, rows, aggregate, scale in (
            ("word", word_rows, statistics.median, WORD_SCALE),
            ("phone", phone_rows, statistics.mean, PHONE_SCALE),
        ):
            own, others = _leave_one_out(rows, rater, aggregate, scale)
            add(f"{level}_accuracy_pearson", pearson_correlation(own, others))
            detection = error_detection_metrics(own, others, ERROR_DETECTION_THRESHOLD)
            add(f"{level}_error_detection_macro_f1", detection["macro_f1"])

    result = {name: statistics.mean(values) for name, values in per_rater.items()}
    result.update(
        {f"{name}_min": min(values) for name, values in per_rater.items()}
        | {f"{name}_max": max(values) for name, values in per_rater.items()}
    )
    result["records"] = len(records)
    result["words"] = len(word_rows)
    result["phones"] = len(phone_rows)
    return result


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m echolingo_speech.evaluation.rater_agreement")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument(
        "--partition", choices=("train", "validation", "test"), default="validation"
    )
    parser.add_argument("--out", type=Path, default=None, help="also write the result as JSON")
    args = parser.parse_args(argv)

    records = [record for record in read_jsonl(args.manifest) if record.partition == args.partition]
    result = rater_agreement(records)
    for key, value in result.items():
        print(f"{key} = {value}")
    if args.out is not None:
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
