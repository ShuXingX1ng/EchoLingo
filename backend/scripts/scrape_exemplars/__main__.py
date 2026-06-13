"""
Scrape pipeline entry point.

Usage (from backend/):
    python -m scripts.scrape_exemplars                         # wikipedia, default limit
    python -m scripts.scrape_exemplars --adapter wikipedia     # explicit
    python -m scripts.scrape_exemplars --adapter jijing        # recalled questions (data file required)
    python -m scripts.scrape_exemplars --limit 10              # first 10 topics / items
    python -m scripts.scrape_exemplars --force                 # overwrite existing output

Jijing note: place recall data at backend/data/jijing_raw/jijing.jsonl before running
the jijing adapter. That path is gitignored. See sources/jijing.py for the format.
"""

import argparse
import json
import sys
from pathlib import Path

# Ensure backend/ is importable when called from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from scripts.scrape_exemplars.sources.jijing import JijingAdapter
from scripts.scrape_exemplars.sources.wikipedia import WikipediaAdapter

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "exemplars_raw"

_ADAPTERS = {
    "wikipedia": WikipediaAdapter,
    "jijing": JijingAdapter,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape Stimulus Exemplars from public sources.")
    parser.add_argument(
        "--adapter",
        choices=list(_ADAPTERS),
        default="wikipedia",
        help="Which SourceAdapter to run (default: wikipedia).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap the number of source articles fetched.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing output file.",
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / f"{args.adapter}.jsonl"

    if out_path.exists() and not args.force:
        print(f"Output already exists at {out_path}. Use --force to overwrite.")
        return 0

    adapter_cls = _ADAPTERS[args.adapter]
    kwargs: dict = {}
    if args.limit is not None:
        kwargs["limit"] = args.limit
    adapter = adapter_cls(**kwargs)

    print(f"Running adapter: {args.adapter}")
    count = 0
    with out_path.open("w", encoding="utf-8") as fh:
        for exemplar in adapter.fetch():
            fh.write(json.dumps(exemplar.to_dict(), ensure_ascii=False) + "\n")
            count += 1
            if count % 20 == 0:
                print(f"  {count} exemplars written …")

    print(f"Done. {count} raw exemplars → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
