"""
LangGraph-based PTE Feedback Pipeline

Replaces the asyncio.gather + manual retry logic in routers/pte_feedback.py.
Nodes: retrieve_context → (call_primary ‖ call_judge) → check_divergence
       → retry_primary (if diverged) → finalize
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional, TypedDict

from langgraph.graph import StateGraph, END

from services.llm_chain import llm_chain
from services.prompt_loader import prompts
from services.rag import retrieve_context as rag_retrieve

logger = logging.getLogger(__name__)

SCORED_SPEAKING  = {"read_aloud", "repeat_sentence", "answer_short_question", "describe_image", "re_tell_lecture"}
SCORED_WRITING   = {"summarize_written_text", "write_essay"}
SCORED_READING   = {"fill_in_the_blanks_reading", "re_order_paragraphs", "multiple_choice_reading"}
SCORED_LISTENING = {"summarize_spoken_text", "fill_in_the_blanks_listening", "highlight_correct_summary"}


class FeedbackState(TypedDict):
    task_type: str
    stimulus: str
    response: str
    pron_assessment: Optional[dict]
    pron_context: str
    retrieved_context: str
    primary_result: Optional[dict]
    judge_result: Optional[dict]
    diverged: list
    retry_count: int
    final_result: dict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _section(task_type: str) -> str:
    if task_type in SCORED_SPEAKING:  return "speaking"
    if task_type in SCORED_WRITING:   return "writing"
    if task_type in SCORED_READING:   return "reading"
    if task_type in SCORED_LISTENING: return "listening"
    return "unscored"


def _build_primary_system(task_type: str, retrieved_context: str) -> str:
    task = prompts.feedback_tasks[task_type]
    section = _section(task_type)
    schema = prompts.build_primary_schema(section, task["details_schema"])
    parts = [task["system_prompt"].strip(), schema]
    if section != "unscored":
        parts.append(prompts.schema_scoring_note)
    if retrieved_context:
        parts.append(f"\n\n## Scoring Rubrics (retrieved)\n\n{retrieved_context}")
    return "\n\n".join(parts)


def _judge_system(task_type: str) -> Optional[str]:
    if task_type in SCORED_SPEAKING:  return prompts.judge_speaking
    if task_type in SCORED_WRITING:   return prompts.judge_writing
    if task_type in SCORED_READING:   return prompts.judge_reading
    if task_type in SCORED_LISTENING: return prompts.judge_listening
    return None


def _try_parse(raw: str) -> Optional[dict]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[\s\S]*\}', raw)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _extract_scores(parsed: dict) -> Optional[dict]:
    ds = parsed.get("dimensionScores")
    if not isinstance(ds, dict):
        return None
    s = ds.get("section")
    if s == "speaking"  and all(isinstance(ds.get(k), (int, float)) for k in ["fluency", "pronunciation", "content"]):
        return ds
    if s == "writing"   and all(isinstance(ds.get(k), (int, float)) for k in ["grammar", "vocabulary", "form", "content"]):
        return ds
    if s == "reading"   and all(isinstance(ds.get(k), (int, float)) for k in ["vocabulary", "comprehension"]):
        return ds
    if s == "listening" and all(isinstance(ds.get(k), (int, float)) for k in ["comprehension", "accuracy"]):
        return ds
    return None


def _find_divergences(primary: dict, judge: dict) -> list:
    if primary.get("section") != judge.get("section"):
        return []
    dims_map = {
        "speaking":  ["fluency", "pronunciation", "content"],
        "writing":   ["grammar", "vocabulary", "form", "content"],
        "reading":   ["vocabulary", "comprehension"],
        "listening": ["comprehension", "accuracy"],
    }
    dims = dims_map.get(primary["section"], [])
    return [
        {"dimension": d, "primaryScore": primary.get(d, 0), "judgeScore": judge.get(d, 0)}
        for d in dims
        if abs(primary.get(d, 0) - judge.get(d, 0)) > 15
    ]


def _format_pron_context(pron: Optional[dict]) -> str:
    if not pron:
        return ""
    return (
        f"\n\nAzure Pronunciation scores — Overall: {pron.get('score')}, "
        f"Accuracy: {pron.get('accuracyScore')}, Fluency: {pron.get('fluencyScore')}, "
        f"Completeness: {pron.get('completenessScore')}"
    )


def _build_user_content(state: FeedbackState) -> str:
    pron_ctx = state.get("pron_context", "")
    if state.get("stimulus"):
        return f"Stimulus:\n{state['stimulus']}\n\nCandidate response:\n{state['response'].strip()}{pron_ctx}"
    return f"Candidate response:\n{state['response'].strip()}{pron_ctx}"


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

async def retrieve_context_node(state: FeedbackState) -> dict:
    ctx = await rag_retrieve(state["task_type"])
    return {"retrieved_context": ctx}


async def process_pronunciation_node(state: FeedbackState) -> dict:
    """Format the pronunciation assessment dict into a context string for the LLM nodes."""
    return {"pron_context": _format_pron_context(state.get("pron_assessment"))}


async def call_primary_node(state: FeedbackState) -> dict:
    system = _build_primary_system(state["task_type"], state.get("retrieved_context", ""))
    user = _build_user_content(state)
    raw = await llm_chain.ainvoke(
        system=system,
        user=user,
        temperature=0.3,
        max_tokens=1200,
        json_mode=True,
        timeout=60.0,
    )
    return {"primary_result": _try_parse(raw or "")}


async def call_judge_node(state: FeedbackState) -> dict:
    judge_sys = _judge_system(state["task_type"])
    if not judge_sys:
        return {"judge_result": None}
    try:
        user = _build_user_content(state)
        raw = await llm_chain.ainvoke(
            system=judge_sys,
            user=user,
            temperature=0.3,
            max_tokens=200,
            json_mode=True,
            timeout=30.0,
        )
        return {"judge_result": _try_parse(raw or "")}
    except Exception:
        return {"judge_result": None}


async def check_divergence_node(state: FeedbackState) -> dict:
    primary = state.get("primary_result")
    judge = state.get("judge_result")
    if not primary or not judge:
        return {"diverged": []}
    p_scores = _extract_scores(primary)
    j_scores = _extract_scores(judge)
    if not p_scores or not j_scores:
        return {"diverged": []}
    return {"diverged": _find_divergences(p_scores, j_scores)}


def _route_after_divergence(state: FeedbackState) -> str:
    return "retry_primary" if state.get("diverged") else "finalize"


async def retry_primary_node(state: FeedbackState) -> dict:
    diverged = state["diverged"]
    user = _build_user_content(state) + "\n\n" + prompts.build_retry_note(diverged)
    system = _build_primary_system(state["task_type"], state.get("retrieved_context", ""))
    try:
        raw = await llm_chain.ainvoke(
            system=system,
            user=user,
            temperature=0.3,
            max_tokens=1200,
            json_mode=True,
            timeout=60.0,
        )
        parsed = _try_parse(raw or "")
        if parsed:
            return {"primary_result": parsed, "retry_count": state.get("retry_count", 0) + 1}
    except Exception:
        pass
    return {"retry_count": state.get("retry_count", 0) + 1}


async def finalize_node(state: FeedbackState) -> dict:
    result = dict(state.get("primary_result") or {})
    pron = state.get("pron_assessment")
    if pron:
        result["pronunciationAssessment"] = pron
    diverged = state.get("diverged", [])
    if diverged:
        judge_log = {
            "taskType": state["task_type"],
            "divergedDimensions": diverged,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        result["judgeLog"] = judge_log
        logger.warning("[LLM-as-Judge] Divergence logged: %s", judge_log)
    # Per-request quality metric: divergence rate vs. RAG grounding can be
    # compared by aggregating these lines before/after seeding the vector store.
    logger.info(
        "[feedback-graph] task_type=%s rag_chars=%d diverged=%d retried=%d",
        state["task_type"],
        len(state.get("retrieved_context", "")),
        len(diverged),
        state.get("retry_count", 0),
    )
    return {"final_result": result}


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def _build_graph():
    builder = StateGraph(FeedbackState)

    builder.add_node("retrieve_context", retrieve_context_node)
    builder.add_node("process_pronunciation", process_pronunciation_node)
    builder.add_node("call_primary", call_primary_node)
    builder.add_node("call_judge", call_judge_node)
    builder.add_node("check_divergence", check_divergence_node)
    builder.add_node("retry_primary", retry_primary_node)
    builder.add_node("finalize", finalize_node)

    builder.set_entry_point("retrieve_context")
    # retrieve_context → process_pronunciation (format pron data before LLM calls)
    builder.add_edge("retrieve_context", "process_pronunciation")
    # Fan-out: process_pronunciation → call_primary ‖ call_judge (parallel)
    builder.add_edge("process_pronunciation", "call_primary")
    builder.add_edge("process_pronunciation", "call_judge")
    # Fan-in: both complete → check_divergence
    builder.add_edge("call_primary", "check_divergence")
    builder.add_edge("call_judge", "check_divergence")
    # Conditional edge: diverged → retry, else → finalize
    builder.add_conditional_edges(
        "check_divergence",
        _route_after_divergence,
        {"retry_primary": "retry_primary", "finalize": "finalize"},
    )
    builder.add_edge("retry_primary", "finalize")
    builder.add_edge("finalize", END)

    return builder.compile()


_graph = _build_graph()


async def run_feedback_graph(request) -> dict:
    """Run the feedback pipeline and return the merged final result dict."""
    initial_state: FeedbackState = {
        "task_type": request.taskType,
        "stimulus": request.stimulus or "",
        "response": request.response.strip(),
        "pron_assessment": request.pronunciationAssessment,
        "pron_context": "",
        "retrieved_context": "",
        "primary_result": None,
        "judge_result": None,
        "diverged": [],
        "retry_count": 0,
        "final_result": {},
    }
    result = await _graph.ainvoke(initial_state)
    return result.get("final_result") or {}
