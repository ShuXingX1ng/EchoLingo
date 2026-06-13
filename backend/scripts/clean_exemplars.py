"""
Cleaning pipeline for raw Stimulus Exemplar JSONL files.

Reads  backend/data/exemplars_raw/<source>.jsonl
Writes backend/data/exemplars_clean/<source>.jsonl

Each output line: CleanExemplar JSON (normalized_text, status, reason,
word_count, lang, source_url, license, task_type).

Usage (from backend/):
    python scripts/clean_exemplars.py                      # clean all raw sources
    python scripts/clean_exemplars.py --source wikipedia   # specific source
    python scripts/clean_exemplars.py --skip-llm           # skip DeepSeek gate
    python scripts/clean_exemplars.py --force              # overwrite existing output
"""

import argparse
import json
import sys
from pathlib import Path

# Ensure backend/ is importable when called from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.scrape_exemplars.base import RawExemplar
from scripts.scrape_exemplars.cleaner import clean_exemplars, print_metrics

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "exemplars_raw"
CLEAN_DIR = Path(__file__).resolve().parent.parent / "data" / "exemplars_clean"


def _load_raw(path: Path) -> list[RawExemplar]:
    items = []
    with path.open(encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                items.append(RawExemplar.from_dict(json.loads(line)))
            except Exception as exc:
                print(f"  [warn] skipping malformed line {lineno} in {path.name}: {exc}")
    return items


def _clean_source(source: str, skip_llm: bool, force: bool) -> None:
    raw_path = RAW_DIR / f"{source}.jsonl"
    if not raw_path.exists():
        print(f"[skip] {raw_path} not found.")
        return

    clean_path = CLEAN_DIR / f"{source}.jsonl"
    if clean_path.exists() and not force:
        print(f"[skip] {clean_path} already exists. Use --force to overwrite.")
        return

    print(f"Cleaning {raw_path} …")
    raw_items = _load_raw(raw_path)
    print(f"  Loaded {len(raw_items)} raw exemplars.")

    results = clean_exemplars(raw_items, skip_llm=skip_llm)

    CLEAN_DIR.mkdir(parents=True, exist_ok=True)
    with clean_path.open("w", encoding="utf-8") as fh:
        for item in results:
            fh.write(json.dumps(item.to_dict(), ensure_ascii=False) + "\n")

    print(f"  Written {len(results)} entries → {clean_path}")
    print_metrics(results)


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean raw Stimulus Exemplar JSONL files.")
    parser.add_argument(
        "--source",
        default=None,
        help="Source name (stem of the raw JSONL file). Defaults to all files in exemplars_raw/.",
    )
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        help="Skip the DeepSeek quality gate (useful offline or for quick testing).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing clean output.",
    )
    args = parser.parse_args()

    if not RAW_DIR.exists():
        print(f"Raw data directory not found: {RAW_DIR}", file=sys.stderr)
        print("Run the scraper first: python -m scripts.scrape_exemplars", file=sys.stderr)
        return 1

    if args.source:
        sources = [args.source]
    else:
        sources = [p.stem for p in sorted(RAW_DIR.glob("*.jsonl"))]

    if not sources:
        print("No raw JSONL files found. Run the scraper first.")
        return 1

    for source in sources:
        _clean_source(source, skip_llm=args.skip_llm, force=args.force)

    print("\nAll sources cleaned.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
