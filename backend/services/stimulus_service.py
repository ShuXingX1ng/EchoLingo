"""
Stimulus generation service

Holds the serving logic behind POST /api/pte/stimulus so the router stays thin
(consistent with pte_feedback.py). Implements ADR 0008's three-tier graceful
degradation plus the originality guard:

  verbatim=true            → return an Exemplar's original text (no generation).
  Task Type has Exemplars  → retrieve N, inject as few-shot anchors, generate a
                             NEW original Stimulus; regenerate once if it overlaps
                             an anchor too much (originality guard).
  bank empty               → pure-AI generation (the legacy path).
  retrieval / DB failure   → silent pure-AI generation (never a bare 502).

LLM errors still propagate to the router, which maps them to 502/500 as before.
"""

from __future__ import annotations

import logging
from typing import Optional

from services.exemplar_store import get_verbatim, retrieve
from services.llm_chain import llm_chain
from services.originality import is_too_similar
from services.prompt_loader import prompts

logger = logging.getLogger(__name__)

# JSON-structured task types. Their Exemplar bank is empty this phase, so they
# always flow through the pure-AI tier — no special-casing needed (brief §key).
JSON_TASK_TYPES = {
    "fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading",
    "fill_in_the_blanks_listening", "highlight_correct_summary",
}

# Number of few-shot anchors injected per generation.
FEWSHOT_N = 3


async def _generate(user: str, is_json: bool) -> str:
    """Single LLM generation call with the stimulus system prompt."""
    return await llm_chain.ainvoke(
        system=prompts.stimulus_system,
        user=user,
        temperature=0.85,
        max_tokens=800 if is_json else 300,
        json_mode=is_json,
        timeout=30.0,
    )


def _build_fewshot_user(
    base_user: str, exemplar_texts: list[str], topic: Optional[str], mode: str
) -> str:
    """Augment the base task prompt with Exemplar anchors and an originality directive."""
    lines = [
        base_user,
        "",
        "Reference examples — match their STYLE, DIFFICULTY, and FORMAT only. "
        "Do NOT reuse their wording, sentences, phrasing, or specific facts:",
    ]
    for i, text in enumerate(exemplar_texts, 1):
        lines.append(f"--- Example {i} ---")
        lines.append(text)
    if mode == "theme" and topic:
        lines.append("")
        lines.append(f"The generated stimulus MUST be about the theme: {topic}.")
    lines.append("")
    lines.append(
        "Now produce ONE entirely new, original stimulus that follows the "
        "instructions above and reuses none of the examples' content."
    )
    return "\n".join(lines)


async def generate_stimulus(
    task_type: str,
    mode: str = "random",
    topic: Optional[str] = None,
    targeting: Optional[dict] = None,
    verbatim: bool = False,
) -> str:
    """
    Produce the Stimulus text for a Task Type. Caller (router) has already
    validated `task_type` and short-circuited personal_intro.
    """
    is_json = task_type in JSON_TASK_TYPES
    base_user = prompts.stimulus_tasks[task_type]

    # ── Tier 0: verbatim private path — serve an Exemplar's original text. ──
    if verbatim:
        exemplar = await get_verbatim(task_type, topic=topic)
        if exemplar:
            return exemplar.text
        # No Exemplar available — fall through to generation (silent degrade).

    # ── Retrieve few-shot anchors. Empty on JSON tasks, empty bank, or failure. ──
    exemplars = await retrieve(
        task_type, mode=mode, topic=topic, targeting=targeting, n=FEWSHOT_N
    )

    # ── Tier 2/3: no anchors → pure-AI generation (legacy path). ──
    if not exemplars:
        return await _generate(base_user, is_json)

    # ── Tier 1: Exemplar-grounded generation + originality guard. ──
    exemplar_texts = [e.text for e in exemplars]
    user = _build_fewshot_user(base_user, exemplar_texts, topic, mode)

    text = await _generate(user, is_json)
    if is_too_similar(text, exemplar_texts):
        logger.info("Originality guard tripped (task_type=%s) — regenerating once.", task_type)
        text = await _generate(user, is_json)

    return text
