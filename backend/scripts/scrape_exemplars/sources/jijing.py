"""
Jijing (机经) SourceAdapter — PTE recalled exam question bank.

机经 (jī jīng) refers to question-recall data shared by PTE candidates on
Chinese study-abroad forums after sitting the exam. These question sets are
widely used by PTE prep providers in China and are valuable as stimulus
exemplars because they represent actual exam-style prompts.

--------------------------------------------------------------------------------
DATA PRIVACY & COPYRIGHT NOTICE
--------------------------------------------------------------------------------
Recalled exam data is NOT distributed with this repository.

  • The raw recall files live under  backend/data/jijing_raw/
  • That path is already gitignored by the root .gitignore (backend/data/).
  • The adapter code is public and clean; only the data files are kept private.

To populate the data directory, obtain or prepare a JSONL file of recalled
questions and place it at:

    backend/data/jijing_raw/jijing.jsonl

Each line must be a valid JSON object with these fields (all strings required):

    {
        "task_type":  "<pte task type slug>",
        "text":       "<stimulus text>",
        "source":     "<forum/community name>",     // optional, defaults to ""
        "license":    "<CC0|community-data|fair-use>"  // optional, defaults to "community-recall"
    }

Supported task_type values are any valid PTE task-type slug, e.g.:
    read_aloud, repeat_sentence, answer_short_question, write_from_dictation,
    summarize_written_text, write_essay, describe_image, re_tell_lecture,
    summarize_spoken_text, fill_in_the_blanks_reading, re_order_paragraphs,
    multiple_choice_reading, fill_in_the_blanks_listening,
    highlight_correct_summary

Lines with unrecognised task types are yielded anyway — the cleaner's length
gate will reject items that don't fit the expected word-count range.

Lines with `"skip": true` are silently ignored (useful for flagging items
removed after review without deleting the raw file).
--------------------------------------------------------------------------------
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from scripts.scrape_exemplars.base import RawExemplar, SourceAdapter

# Default path to the recall data file. Must be gitignored.
_DEFAULT_DATA_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent / "data" / "jijing_raw" / "jijing.jsonl"
)

_DEFAULT_LICENSE = "community-recall"
_JIJING_SOURCE_URL = "https://pte.zhidao.com"  # generic canonical URL (no per-item URL)


class JijingAdapter(SourceAdapter):
    """Read PTE recalled question data (机经) from a local JSONL file.

    The data file is gitignored — see the module docstring for the expected
    file format and where to place the data.

    Args:
        data_path: Path to the JSONL file. Defaults to
                   ``backend/data/jijing_raw/jijing.jsonl``.
        limit:     If set, stops after yielding this many items.
    """

    def __init__(
        self,
        data_path: Path | str | None = None,
        limit: int | None = None,
    ) -> None:
        self._data_path = Path(data_path) if data_path is not None else _DEFAULT_DATA_PATH
        self._limit = limit

    @property
    def name(self) -> str:
        return "jijing"

    def fetch(self) -> Iterable[RawExemplar]:
        if not self._data_path.exists():
            print(
                f"  [jijing] Data file not found: {self._data_path}\n"
                "  Place a jijing.jsonl file at that path to use this adapter.\n"
                "  See backend/scripts/scrape_exemplars/sources/jijing.py for the format."
            )
            return

        count = 0
        with self._data_path.open(encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, 1):
                if self._limit is not None and count >= self._limit:
                    break

                line = line.strip()
                if not line:
                    continue

                try:
                    record = json.loads(line)
                except json.JSONDecodeError as exc:
                    print(f"  [jijing] skipping malformed line {lineno}: {exc}")
                    continue

                if record.get("skip"):
                    continue

                task_type = record.get("task_type", "").strip()
                text = record.get("text", "").strip()

                if not task_type or not text:
                    print(f"  [jijing] skipping line {lineno}: missing task_type or text")
                    continue

                source = record.get("source", "").strip()
                license_ = record.get("license", _DEFAULT_LICENSE).strip()
                source_url = f"{_JIJING_SOURCE_URL}" + (f"/{source}" if source else "")

                yield RawExemplar(
                    task_type=task_type,
                    text=text,
                    source_url=source_url,
                    license=license_,
                    raw_meta={
                        "source": source,
                        "lineno": lineno,
                    },
                )
                count += 1

        print(f"  [jijing] yielded {count} item(s) from {self._data_path}")
