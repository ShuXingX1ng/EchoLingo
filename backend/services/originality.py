"""
Originality guard

Local word-shingle Jaccard overlap between a generated Stimulus and the
Exemplars that seeded it (ADR 0008 §3). Purely in-process — no API calls.

Used at generation time to reject accidental verbatim regurgitation (over
threshold → regenerate once) and offline by scripts/eval_originality.py to
report the originality distribution.
"""

from __future__ import annotations

import re

# n-gram size for word shingles. 4 balances sensitivity (catches copied phrases)
# against false positives on common short collocations.
SHINGLE_N = 4

# Jaccard overlap above this against any injected Exemplar counts as too similar.
OVERLAP_THRESHOLD = 0.5

_WORD_RE = re.compile(r"[a-z0-9']+")


def _tokenize(text: str) -> list[str]:
    """Lowercase word tokens; punctuation and casing are ignored for overlap."""
    return _WORD_RE.findall(text.lower())


def shingles(text: str, n: int = SHINGLE_N) -> set[tuple[str, ...]]:
    """Return the set of word n-grams in `text`.

    Texts shorter than `n` words collapse to a single shingle of all their words
    so they still compare meaningfully instead of yielding the empty set.
    """
    tokens = _tokenize(text)
    if len(tokens) < n:
        return {tuple(tokens)} if tokens else set()
    return {tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}


def jaccard(a: str, b: str, n: int = SHINGLE_N) -> float:
    """Jaccard similarity of the two texts' word-shingle sets (0.0–1.0)."""
    sa, sb = shingles(a, n), shingles(b, n)
    if not sa or not sb:
        return 0.0
    intersection = len(sa & sb)
    union = len(sa | sb)
    return intersection / union if union else 0.0


def max_overlap(generated: str, exemplars: list[str], n: int = SHINGLE_N) -> float:
    """Highest Jaccard overlap between `generated` and any exemplar text."""
    if not exemplars:
        return 0.0
    return max(jaccard(generated, ex, n) for ex in exemplars)


def is_too_similar(
    generated: str, exemplars: list[str], threshold: float = OVERLAP_THRESHOLD
) -> bool:
    """True when `generated` overlaps any exemplar above `threshold`."""
    return max_overlap(generated, exemplars) > threshold
