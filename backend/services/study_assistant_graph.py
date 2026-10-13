"""
Study Assistant — LangGraph Tool-Calling Pipeline

A multi-turn conversational assistant that uses tools to help PTE Academic
learners navigate the app, generate practice content, and get exam knowledge.

Per ADR-0004 / CONTEXT.md: this is deliberately called "Study Assistant",
NOT "Agent" — "Agent" is reserved for the internal feedback/scoring pipeline.

Graph:  run_tool_loop → finalize → END

The tool-calling loop mirrors call_coach_node in feedback_graph.py:
  - bind_tools(tools) on a ChatOpenAI instance
  - agentic loop (max 4 iterations)
  - forced final answer if loop ends without a clean text reply

Recency gate (source selection) lives in the GRAPH NODE, not the model:
  - Scan the latest user message for recency cues (case-insensitive)
  - Default source="exemplars"; switch to "news" only on a hit
  - Inject resolved source into the generate_practice tool result
"""

from __future__ import annotations

import json
import logging
import re
import urllib.parse
from typing import Optional, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from services.llm_chain import llm_chain

from tools.study_assistant_tools import (
    SUPPORTED_PRACTICE_TASK_TYPES,
    filter_links,
    generate_practice,
    navigate_app,
    pte_knowledge,
)

logger = logging.getLogger(__name__)

# ── Recency cues that switch source from "exemplars" to "news" ────────────────
_RECENCY_CUES = re.compile(
    r"recent|latest|current|news|real-time|最近新闻|实时新闻|最新事件",
    re.IGNORECASE,
)

# ── Tools available to the Study Assistant ────────────────────────────────────
_TOOLS = [navigate_app, generate_practice, pte_knowledge]


# ─────────────────────────────────────────────────────────────────────────────
# State
# ─────────────────────────────────────────────────────────────────────────────

class StudyAssistantState(TypedDict):
    messages: list[dict]      # [{role, content}] from the request
    locale: str               # "en" or "zh"
    reply: str                # final natural-language answer
    links: list[dict]         # [{label, route}] accumulated from navigate_app
    practice: Optional[dict]  # {taskType, taskSlug, topic, source, route} or None


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _locale_instruction(locale: str) -> str:
    if locale == "zh":
        return (
            "You MUST answer in Simplified Chinese (简体中文). "
            "All natural-language text in your reply must be in Chinese."
        )
    return "You MUST answer in English."


def _build_system_prompt(locale: str) -> str:
    return f"""You are the EchoLingo Study Assistant — a helpful conversational guide \
for PTE Academic learners.

{_locale_instruction(locale)}

You have three tools:
1. navigate_app — use for questions about how to find features or pages in the app.
2. generate_practice — use when the learner wants to practise a specific topic. \
   TEXT TASK TYPES ONLY ({", ".join(SUPPORTED_PRACTICE_TASK_TYPES)}). Call this tool with the learner's topic and their \
   chosen (or best-fitting) task type.
3. pte_knowledge — use for questions about the PTE Academic exam format, scoring, \
   timing, or study strategies.

IMPORTANT BOUNDARIES — you must never:
- Claim to submit, score, or save a learner's response.
- Generate a practice Stimulus directly in chat — always use the generate_practice \
  tool, which produces a deep-link the learner navigates to.
- Invent app routes that are not in the allow-list provided by the navigate_app tool.
- Refer to yourself as an "Agent" — you are the Study Assistant.

STYLE — keep every reply short and plain:
- Be concise: 1–3 short sentences. No preamble, no filler, no sign-offs, no \
  follow-up questions like "Anything else?".
- Do NOT use emoji or decorative symbols.
- Do NOT use Markdown headings, and avoid bullet lists unless the learner asked \
  for steps — then at most 3 short bullets.
- Do NOT write links, URLs, routes, or Markdown links in your reply text. The app \
  renders navigation links and the practice button for you from separate data. \
  Just describe what to do in words (e.g. "use the practice button below") and let \
  the UI show the link.

Use tools when they help."""


def _detect_source(messages: list[dict]) -> str:
    """Scan the latest user message for recency cues; return 'news' or 'exemplars'."""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if _RECENCY_CUES.search(content):
                return "news"
            break
    return "exemplars"


def _lc_messages(messages: list[dict], locale: str) -> list:
    """Convert request messages to LangChain message objects."""
    system = SystemMessage(content=_build_system_prompt(locale))
    lc_msgs = [system]
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            lc_msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_msgs.append(AIMessage(content=content))
    return lc_msgs


# ─────────────────────────────────────────────────────────────────────────────
# Graph nodes
# ─────────────────────────────────────────────────────────────────────────────

async def run_tool_loop_node(state: StudyAssistantState) -> dict:
    """
    Agentic tool-calling loop (mirrors call_coach_node in feedback_graph.py).
    Max 4 iterations; falls back to a forced final answer if needed.

    Recency gate: source ("exemplars"|"news") is determined HERE from the
    latest user message, then injected into any generate_practice result.
    """
    messages = state["messages"]
    locale = state["locale"]
    source = _detect_source(messages)

    practice_result: Optional[dict] = None
    reply_text = ""

    def on_tool_result(name: str, raw_result: str) -> None:
        nonlocal practice_result
        # navigate_app and pte_knowledge only add context for the model's
        # reply; generate_practice also yields the practice deep-link.
        if name != "generate_practice":
            return
        try:
            parsed = json.loads(raw_result)
        except Exception:
            return
        if "error" in parsed:
            return
        # The route carries the graph-determined source (recency gate), not
        # whatever the tool was called with.
        route = f"/practice/{parsed['taskSlug']}?mode=theme&topic={urllib.parse.quote(parsed['topic'], safe='')}"
        if source == "news":
            route += "&source=news"
        practice_result = {
            "taskType": parsed["taskType"],
            "taskSlug": parsed["taskSlug"],
            "topic": parsed["topic"],
            "source": source,
            "route": route,
        }

    try:
        loop = await llm_chain.run_tool_loop(
            _lc_messages(messages, locale),
            _TOOLS,
            temperature=0.5,
            max_tokens=800,
            timeout=45.0,
            on_tool_result=on_tool_result,
        )
        reply_text = loop.text.strip()

        # If the loop ended without a text reply, force a final answer
        if not reply_text:
            final = await llm_chain.ainvoke_messages(
                loop.messages, temperature=0.5, max_tokens=600, timeout=30.0,
            )
            reply_text = final.strip()

    except Exception as exc:
        logger.warning("[study-assistant] tool loop failed: %s", exc)
        reply_text = (
            "Sorry, I encountered an error. Please try again."
            if locale != "zh"
            else "抱歉，发生了错误，请重试。"
        )

    # Extract links the model mentioned (any that appear in the model's reply)
    # We surface all allowlisted routes that appear in the reply text as links.
    # This is conservative: the model cannot invent routes, and filter_links
    # drops anything not in _ALLOWED_ROUTES.
    mentioned_links: list[dict] = []
    from services.prompt_loader import prompts
    route_allowlist = prompts.study_assistant_knowledge.get("route_allowlist") or []
    for entry in route_allowlist:
        route = entry.get("route", "")
        label = entry.get("label", "")
        if route and (route in reply_text or (label and label in reply_text)):
            mentioned_links.append({"label": label, "route": route})

    # Always include the practice route link if a practice result was generated
    if practice_result:
        practice_link = {
            "label": practice_result["taskSlug"].replace("-", " ").title(),
            "route": practice_result["route"],
        }
        # Don't add if already present
        if not any(link["route"] == practice_result["route"] for link in mentioned_links):
            mentioned_links.append(practice_link)

    filtered_links = filter_links(mentioned_links)

    return {
        "reply": reply_text,
        "links": filtered_links,
        "practice": practice_result,
    }


async def finalize_node(state: StudyAssistantState) -> dict:
    """Finalise and log the Study Assistant response."""
    logger.info(
        "[study-assistant] locale=%s links=%d practice=%s reply_chars=%d",
        state.get("locale", "en"),
        len(state.get("links") or []),
        bool(state.get("practice")),
        len(state.get("reply") or ""),
    )
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# Graph construction
# ─────────────────────────────────────────────────────────────────────────────

def _build_graph() -> object:
    builder = StateGraph(StudyAssistantState)

    builder.add_node("run_tool_loop", run_tool_loop_node)
    builder.add_node("finalize", finalize_node)

    builder.set_entry_point("run_tool_loop")
    builder.add_edge("run_tool_loop", "finalize")
    builder.add_edge("finalize", END)

    return builder.compile()


_graph = _build_graph()


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

async def run_study_assistant_graph(
    messages: list[dict],
    locale: str = "en",
) -> dict:
    """
    Run the Study Assistant tool-calling pipeline.

    Args:
        messages: Conversation history [{role, content}].
        locale:   "en" or "zh" — controls the reply language.

    Returns:
        {reply: str, links: list[dict], practice: dict|None}
    """
    initial: StudyAssistantState = {
        "messages": messages,
        "locale": locale,
        "reply": "",
        "links": [],
        "practice": None,
    }
    result = await _graph.ainvoke(initial)
    return {
        "reply": result.get("reply") or "",
        "links": result.get("links") or [],
        "practice": result.get("practice"),
    }
