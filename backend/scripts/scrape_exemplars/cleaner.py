"""
Deterministic cleaning rules + optional DeepSeek quality gate for Stimulus Exemplars.

Importable module — the CLI entry point is backend/scripts/clean_exemplars.py.
"""

from __future__ import annotations

import asyncio
import hashlib
import html
import json
import os
import re
from dataclasses import dataclass, field
from typing import Iterable

from scripts.scrape_exemplars.base import RawExemplar

# ── Length gates (word count) ─────────────────────────────────────────────────
LENGTH_GATES: dict[str, tuple[int, int]] = {
    "read_aloud": (10, 60),
    "summarize_written_text": (150, 300),
}

_CITATION_RE = re.compile(r"\[\d+\]|\[note\s*\d+\]|\[citation needed\]|\[edit\]", re.IGNORECASE)
_TEMPLATE_RE = re.compile(r"\{\{[^}]*\}\}")
_MULTI_SPACE = re.compile(r"[ \t]+")
_MULTI_NEWLINE = re.compile(r"\n{3,}")


@dataclass
class CleanExemplar:
    task_type: str
    normalized_text: str
    source_url: str
    license: str
    status: str         # "accept" | "reject"
    reason: str
    word_count: int
    lang: str
    raw_meta: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "task_type": self.task_type,
            "normalized_text": self.normalized_text,
            "source_url": self.source_url,
            "license": self.license,
            "status": self.status,
            "reason": self.reason,
            "word_count": self.word_count,
            "lang": self.lang,
            "raw_meta": self.raw_meta,
        }


# ── Deterministic rules ───────────────────────────────────────────────────────

def strip_markup(text: str) -> str:
    """Remove HTML entities, citation markers, template noise; normalise whitespace."""
    text = html.unescape(text)
    text = _CITATION_RE.sub("", text)
    text = _TEMPLATE_RE.sub("", text)
    # Remove bare URLs
    text = re.sub(r"https?://\S+", "", text)
    text = _MULTI_SPACE.sub(" ", text)
    text = _MULTI_NEWLINE.sub("\n\n", text)
    return text.strip()


def is_english(text: str) -> bool:
    """Heuristic: text is English if ≥85 % of alphabetic chars are ASCII letters."""
    alpha = [c for c in text if c.isalpha()]
    if not alpha:
        return False
    ascii_alpha = sum(1 for c in alpha if ord(c) < 128)
    return (ascii_alpha / len(alpha)) >= 0.85


def word_count(text: str) -> int:
    return len(text.split())


def sha256_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def dedup_by_hash(exemplars: list[RawExemplar]) -> list[RawExemplar]:
    """Return exemplars with exact-duplicate texts removed (first occurrence kept)."""
    seen: set[str] = set()
    unique: list[RawExemplar] = []
    for ex in exemplars:
        h = sha256_hash(ex.text)
        if h not in seen:
            seen.add(h)
            unique.append(ex)
    return unique


def apply_length_gate(text: str, task_type: str) -> tuple[bool, str]:
    """Return (passes, reason). Reason is empty string when passes=True."""
    bounds = LENGTH_GATES.get(task_type)
    if bounds is None:
        return True, ""
    lo, hi = bounds
    wc = word_count(text)
    if wc < lo:
        return False, f"too_short ({wc} words < {lo})"
    if wc > hi:
        return False, f"too_long ({wc} words > {hi})"
    return True, ""


# ── DeepSeek quality gate ─────────────────────────────────────────────────────

_LLM_SYSTEM = (
    "You are a quality gate for PTE Academic practice text. "
    "Given a passage and its task type, respond with ONLY a JSON object: "
    '{"status": "accept" or "reject", "reason": "<brief phrase (≤10 words)>"}. '
    "Accept: coherent formal English, complete sentences, academic/educational topic. "
    "Reject: too informal, jargon-only, incomplete sentences, non-prose (lists/tables). "
    "Never rewrite or alter the text. Only judge."
)


async def _llm_gate_async(text: str, task_type: str) -> dict:
    """Call DeepSeek to accept/reject one exemplar. Raises on API error."""
    from services.llm_chain import llm_chain  # deferred import — not needed in tests

    prompt = f"task_type: {task_type}\n\ntext:\n{text[:800]}"
    raw = await llm_chain.ainvoke(
        system=_LLM_SYSTEM,
        user=prompt,
        temperature=0.0,
        max_tokens=60,
        json_mode=True,
        timeout=20.0,
    )
    try:
        result = json.loads(raw)
        if result.get("status") not in ("accept", "reject"):
            raise ValueError("unexpected status")
        return result
    except Exception:
        return {"status": "accept", "reason": "llm_parse_error"}


def llm_gate(text: str, task_type: str) -> dict:
    """Synchronous wrapper for the LLM quality gate.

    Returns {"status": "accept"/"reject", "reason": str}.
    Auto-skips (accept) when LLM_API_KEY is not set.
    """
    if not os.getenv("LLM_API_KEY"):
        return {"status": "accept", "reason": "llm_skipped_no_key"}
    try:
        return asyncio.run(_llm_gate_async(text, task_type))
    except Exception as exc:
        print(f"  [llm_gate] error: {exc} — accepting by default")
        return {"status": "accept", "reason": "llm_error_fallback"}


# ── Main cleaning pipeline ────────────────────────────────────────────────────

def clean_exemplars(
    raw_items: Iterable[RawExemplar],
    skip_llm: bool = False,
) -> list[CleanExemplar]:
    """
    Apply full cleaning pipeline to an iterable of RawExemplar.

    Steps:
      1. Markup stripping + whitespace normalisation
      2. English filter
      3. Length gate
      4. SHA-256 hash dedup (across all passing items so far)
      5. Optional DeepSeek accept/reject gate

    Returns all items (accepted and rejected) so the caller can print metrics.
    """
    results: list[CleanExemplar] = []
    seen_hashes: set[str] = set()

    for raw in raw_items:
        text = strip_markup(raw.text)
        lang = "en" if is_english(text) else "unknown"

        if lang != "en":
            results.append(_make_rejected(raw, text, lang, "non_english"))
            continue

        passes, gate_reason = apply_length_gate(text, raw.task_type)
        if not passes:
            results.append(_make_rejected(raw, text, lang, gate_reason))
            continue

        h = sha256_hash(text)
        if h in seen_hashes:
            results.append(_make_rejected(raw, text, lang, "duplicate"))
            continue
        seen_hashes.add(h)

        if skip_llm or not os.getenv("LLM_API_KEY"):
            llm_result = {"status": "accept", "reason": "llm_skipped"}
        else:
            llm_result = llm_gate(text, raw.task_type)

        wc = word_count(text)
        results.append(
            CleanExemplar(
                task_type=raw.task_type,
                normalized_text=text,
                source_url=raw.source_url,
                license=raw.license,
                status=llm_result["status"],
                reason=llm_result.get("reason", ""),
                word_count=wc,
                lang=lang,
                raw_meta=raw.raw_meta,
            )
        )

    return results


def _make_rejected(raw: RawExemplar, text: str, lang: str, reason: str) -> CleanExemplar:
    return CleanExemplar(
        task_type=raw.task_type,
        normalized_text=text,
        source_url=raw.source_url,
        license=raw.license,
        status="reject",
        reason=reason,
        word_count=word_count(text),
        lang=lang,
        raw_meta=raw.raw_meta,
    )


def print_metrics(results: list[CleanExemplar]) -> None:
    """Print per-task-type accept/reject counts and top reject reasons."""
    from collections import Counter

    task_types = sorted({r.task_type for r in results})
    for tt in task_types:
        subset = [r for r in results if r.task_type == tt]
        accepted = sum(1 for r in subset if r.status == "accept")
        rejected = len(subset) - accepted
        print(f"\n[{tt}]  accepted={accepted}  rejected={rejected}  total={len(subset)}")
        if rejected:
            reject_reasons = Counter(r.reason for r in subset if r.status == "reject")
            for reason, cnt in reject_reasons.most_common(5):
                print(f"  reject reason: {reason!r} × {cnt}")
