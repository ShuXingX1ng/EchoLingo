#!/usr/bin/env python3
"""
Originality eval for Stimulus generation (Phase Data-1, offline).

Samples Exemplar-grounded generations and reports the word-shingle Jaccard
overlap distribution between each generated Stimulus and the Exemplars that
seeded it (services/originality.py). High overlap means the model is
regurgitating its anchors; the OVERLAP_THRESHOLD guard should keep the tail low.

This is a manual/offline tool — it makes real DashScope (embedding) + DeepSeek
(generation) + Supabase (retrieval) calls and is NOT wired into CI.

Usage (from backend/):
    python scripts/eval_originality.py                       # all text task types
    python scripts/eval_originality.py --task-type read_aloud
    python scripts/eval_originality.py --samples 10 --mode theme --topic environment

Requires env: LLM_API_KEY, DASHSCOPE_API_KEY, SUPABASE_DB_URL (+ optional base URLs).
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
from pathlib import Path

# Ensure backend/ is importable when called from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.exemplar_store import retrieve  # noqa: E402
from services.originality import OVERLAP_THRESHOLD, max_overlap  # noqa: E402
from services.stimulus_service import (  # noqa: E402
    FEWSHOT_N,
    JSON_TASK_TYPES,
    _build_fewshot_user,
    _generate,
)
from services.prompt_loader import prompts  # noqa: E402

# Text (non-JSON) task types are the only ones with a populated Exemplar bank.
TEXT_TASK_TYPES = sorted(set(prompts.stimulus_tasks) - JSON_TASK_TYPES)


async def _sample_overlaps(
    task_type: str, mode: str, topic: str | None, samples: int
) -> list[float]:
    """Generate `samples` stimuli and return each one's max overlap vs its anchors."""
    exemplars = await retrieve(task_type, mode=mode, topic=topic, n=FEWSHOT_N)
    if not exemplars:
        print(f"[{task_type}] no exemplars — skipping (would use pure-AI fallback).")
        return []

    exemplar_texts = [e.text for e in exemplars]
    user = _build_fewshot_user(prompts.stimulus_tasks[task_type], exemplar_texts, topic, mode)

    overlaps: list[float] = []
    for i in range(samples):
        text = await _generate(user, is_json=False)
        overlap = max_overlap(text, exemplar_texts)
        overlaps.append(overlap)
        print(f"  sample {i + 1}/{samples}: max overlap = {overlap:.3f}")
    return overlaps


def _report(task_type: str, overlaps: list[float]) -> None:
    if not overlaps:
        return
    over = sum(1 for o in overlaps if o > OVERLAP_THRESHOLD)
    print(
        f"\n[{task_type}] n={len(overlaps)}  "
        f"min={min(overlaps):.3f}  mean={statistics.mean(overlaps):.3f}  "
        f"median={statistics.median(overlaps):.3f}  max={max(overlaps):.3f}  "
        f"over_threshold(>{OVERLAP_THRESHOLD})={over} ({over / len(overlaps):.0%})"
    )


async def run(task_type: str | None, mode: str, topic: str | None, samples: int) -> int:
    task_types = [task_type] if task_type else TEXT_TASK_TYPES
    all_overlaps: list[float] = []

    for tt in task_types:
        print(f"\n=== {tt} (mode={mode}) ===")
        overlaps = await _sample_overlaps(tt, mode, topic, samples)
        _report(tt, overlaps)
        all_overlaps.extend(overlaps)

    if all_overlaps:
        over = sum(1 for o in all_overlaps if o > OVERLAP_THRESHOLD)
        print(
            f"\n=== OVERALL ===\n"
            f"n={len(all_overlaps)}  mean={statistics.mean(all_overlaps):.3f}  "
            f"max={max(all_overlaps):.3f}  "
            f"over_threshold={over} ({over / len(all_overlaps):.0%})"
        )
    else:
        print("\nNo overlaps measured — the Exemplar bank may be empty.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline originality eval for Stimulus generation.")
    parser.add_argument("--task-type", default=None, help="Single task type (defaults to all text types).")
    parser.add_argument("--mode", default="random", choices=["random", "targeted", "theme"])
    parser.add_argument("--topic", default=None, help="Theme query (mode=theme).")
    parser.add_argument("--samples", type=int, default=5, help="Generations per task type.")
    args = parser.parse_args()
    return asyncio.run(run(args.task_type, args.mode, args.topic, args.samples))


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    raise SystemExit(main())
