"""
ECDICT Service

Read-only SQLite lookups against the bundled ECDICT dictionary (see ADR 0006).
Single English words resolve here instantly and offline; the router falls
through to the DeepSeek LLM on a miss or for phrases.

The dictionary file is produced by `scripts/import_ecdict.py` and is gitignored.
"""

import re
import sqlite3
from pathlib import Path
from typing import Optional, TypedDict

_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "ecdict.sqlite"

# Map ECDICT tag codes -> Chinese exam labels surfaced on the Word Lookup card.
_TAG_LABELS = {
    "zk": "中考",
    "gk": "高考",
    "ky": "考研",
    "cet4": "四级",
    "cet6": "六级",
    "ielts": "雅思",
    "toefl": "托福",
    "gre": "GRE",
}

# A translation line usually starts with a part-of-speech marker we can split off:
#   "n. 银行, 堤, 岸"  ->  pos="n.", meaning="银行, 堤, 岸"
#   "[医] 库"          ->  pos="[医]", meaning="库"
# Lines with no recognised marker (e.g. "run的过去式和过去分词") keep pos="".
_POS_RE = re.compile(r"^\s*((?:\[[^\]]+\]|[a-z]+\.)(?:\s*&\s*[a-z]+\.)*)\s*(.*)$")


class Entry(TypedDict):
    pos: str
    meaning: str


class LookupResult(TypedDict):
    source: str
    text: str
    phonetic: str
    entries: list[Entry]
    tags: list[str]


def is_ready() -> bool:
    """True when the dictionary file has been imported."""
    return _DB_PATH.exists()


def _connect() -> sqlite3.Connection:
    # read-only, immutable: safe for concurrent request handlers.
    return sqlite3.connect(f"file:{_DB_PATH}?mode=ro&immutable=1", uri=True)


def _parse_entries(translation: str) -> list[Entry]:
    entries: list[Entry] = []
    for line in (translation or "").split("\n"):
        line = line.strip()
        if not line:
            continue
        m = _POS_RE.match(line)
        if m and m.group(2):
            entries.append({"pos": m.group(1).strip(), "meaning": m.group(2).strip()})
        else:
            entries.append({"pos": "", "meaning": line})
    return entries


def _parse_tags(tag: str) -> list[str]:
    seen, labels = set(), []
    for code in (tag or "").split():
        label = _TAG_LABELS.get(code)
        if label and label not in seen:
            seen.add(label)
            labels.append(label)
    return labels


def lookup(word: str) -> Optional[LookupResult]:
    """
    Look a single word up in ECDICT. Returns None on miss (caller falls back
    to the LLM). Tries the exact form first, then a lowercased form.
    """
    if not is_ready():
        return None

    conn = _connect()
    try:
        row = conn.execute(
            "SELECT word, phonetic, translation, tag FROM stardict WHERE word = ? LIMIT 1",
            (word,),
        ).fetchone()
        if row is None and word != word.lower():
            row = conn.execute(
                "SELECT word, phonetic, translation, tag FROM stardict WHERE word = ? LIMIT 1",
                (word.lower(),),
            ).fetchone()
    finally:
        conn.close()

    if row is None:
        return None

    db_word, phonetic, translation, tag = row
    entries = _parse_entries(translation)
    if not entries:
        return None  # entry exists but has no Chinese gloss — treat as a miss

    return {
        "source": "dictionary",
        "text": db_word,
        "phonetic": phonetic or "",
        "entries": entries,
        "tags": _parse_tags(tag),
    }
