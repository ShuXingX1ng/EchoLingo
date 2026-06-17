"""
Study Assistant Tools

Three LangChain tools for the Study Assistant's tool-calling loop:
  1. navigate_app   — answer "how/where/what is" questions with allow-listed links.
  2. generate_practice — build a practice deep-link for a text Task Type + topic.
  3. pte_knowledge  — answer PTE exam FAQ questions from the knowledge file.

All tools are pure Python callables decorated with @lc_tool (same style as
tools/rubric.py). They read from the singleton `prompts.study_assistant_knowledge`
loaded at startup — no file I/O at request time.

NOTE: "Agent" is intentionally avoided in all naming per ADR-0004 / CONTEXT.md.
"""

from __future__ import annotations

import json
import logging
import urllib.parse

from langchain_core.tools import tool as lc_tool

from services.prompt_loader import prompts

logger = logging.getLogger(__name__)

# ── Route allow-list (derived from the knowledge YAML at startup) ─────────────
# Stored as a set of valid route strings for O(1) filtering.
_ALLOWED_ROUTES: set[str] = {
    entry["route"]
    for entry in (prompts.study_assistant_knowledge.get("route_allowlist") or [])
}

# ── Text-only Task Types (MVP scope) ─────────────────────────────────────────
# These are the only types supported by the generate_practice tool.
# Audio-only types are explicitly listed in the reject set below.
_TEXT_TASK_TYPES: set[str] = {
    "read_aloud",
    "summarize_written_text",
    "write_essay",
    "fill_in_the_blanks_reading",
    "re_order_paragraphs",
    "multiple_choice_reading",
    "highlight_correct_summary",
}

_AUDIO_ONLY_TASK_TYPES: set[str] = {
    "repeat_sentence",
    "write_from_dictation",
    "describe_image",
    "re_tell_lecture",
    "answer_short_question",
    "summarize_spoken_text",
    "fill_in_the_blanks_listening",
    "personal_intro",
}

# Task type → URL slug mapping
_TASK_SLUG: dict[str, str] = {
    "read_aloud": "read-aloud",
    "summarize_written_text": "summarize-written-text",
    "write_essay": "write-essay",
    "fill_in_the_blanks_reading": "fill-in-the-blanks",
    "re_order_paragraphs": "re-order-paragraphs",
    "multiple_choice_reading": "multiple-choice",
    "highlight_correct_summary": "highlight-correct-summary",
}


def filter_links(links: list[dict]) -> list[dict]:
    """
    Drop any link whose route is not in the allow-list.
    Called by the graph node after tool execution — the model cannot invent routes.
    """
    return [link for link in links if link.get("route") in _ALLOWED_ROUTES]


# ─────────────────────────────────────────────────────────────────────────────
# Tool 1: navigate_app
# ─────────────────────────────────────────────────────────────────────────────

@lc_tool
def navigate_app(query: str) -> str:
    """
    Answer learner questions about how to find features or pages in the EchoLingo
    app. Returns a JSON object with 'answer' (natural language) and 'links' (a
    list of {label, route} objects drawn from the allow-list only).

    Use this for questions like: "Where can I see my history?", "How do I
    practise Write Essay?", "What is the Mock Exam?", "How does Word Lookup work?"
    """
    knowledge = prompts.study_assistant_knowledge
    feature_map = knowledge.get("feature_map") or {}
    route_allowlist = knowledge.get("route_allowlist") or []

    # Build a structured context string for the response
    feature_summary = "\n".join(
        f"- {key}: {val.strip() if isinstance(val, str) else json.dumps(val)}"
        for key, val in feature_map.items()
        if isinstance(val, str)
    )
    routes_str = "\n".join(
        f"  {entry['label']}: {entry['route']}"
        for entry in route_allowlist
    )

    result = {
        "feature_summary": feature_summary,
        "routes": routes_str,
        "query": query,
    }
    return json.dumps(result, ensure_ascii=False)


# ─────────────────────────────────────────────────────────────────────────────
# Tool 2: generate_practice
# ─────────────────────────────────────────────────────────────────────────────

@lc_tool
def generate_practice(topic: str, task_type: str) -> str:
    """
    Build a practice deep-link for a learner-chosen topic and text Task Type.
    Returns a JSON object with taskType, taskSlug, topic, source, and route.

    TEXT TASK TYPES ONLY: read_aloud, summarize_written_text, write_essay,
    fill_in_the_blanks_reading, re_order_paragraphs, multiple_choice_reading,
    highlight_correct_summary.

    Audio-only Task Types (repeat_sentence, write_from_dictation, describe_image,
    re_tell_lecture, answer_short_question, summarize_spoken_text,
    fill_in_the_blanks_listening, personal_intro) are NOT supported at MVP and
    will return an error message.

    NOTE: This tool does NOT generate the Stimulus itself. Generation happens
    on the Practice page when the learner navigates to the deep-link.
    The 'source' field in the result is set by the graph node (not this tool)
    based on recency cues in the learner's message.
    """
    task_type_clean = task_type.strip().lower().replace("-", "_").replace(" ", "_")

    if task_type_clean in _AUDIO_ONLY_TASK_TYPES:
        return json.dumps({
            "error": (
                f"'{task_type}' is an audio Task Type and is not supported for "
                "topic-based practice generation at this time. Please choose a "
                "text Task Type such as Write Essay, Summarize Written Text, or "
                "Read Aloud."
            )
        }, ensure_ascii=False)

    if task_type_clean not in _TEXT_TASK_TYPES:
        return json.dumps({
            "error": (
                f"'{task_type}' is not a recognised text Task Type. "
                "Supported types: read_aloud, summarize_written_text, write_essay, "
                "fill_in_the_blanks_reading, re_order_paragraphs, "
                "multiple_choice_reading, highlight_correct_summary."
            )
        }, ensure_ascii=False)

    slug = _TASK_SLUG[task_type_clean]
    encoded_topic = urllib.parse.quote(topic, safe="")
    # source will be injected by the graph node — default exemplars here
    route = f"/practice/{slug}?mode=theme&topic={encoded_topic}"

    result = {
        "taskType": task_type_clean,
        "taskSlug": slug,
        "topic": topic,
        "source": "exemplars",  # graph node may override to "news"
        "route": route,
    }
    return json.dumps(result, ensure_ascii=False)


# ─────────────────────────────────────────────────────────────────────────────
# Tool 3: pte_knowledge
# ─────────────────────────────────────────────────────────────────────────────

@lc_tool
def pte_knowledge(query: str) -> str:
    """
    Answer questions about the PTE Academic exam: format, Task Types, scoring
    dimensions, timing, score requirements, and study strategies.

    Use this for questions like: "How is Write Essay scored?", "How long is the
    PTE exam?", "What score do I need for university?", "Tips for Describe Image?"
    """
    faq = prompts.study_assistant_knowledge.get("pte_faq") or []
    faq_text = "\n\n".join(
        f"Q: {item['q']}\nA: {item['a'].strip() if isinstance(item['a'], str) else item['a']}"
        for item in faq
    )
    return json.dumps({
        "faq_context": faq_text,
        "query": query,
    }, ensure_ascii=False)
