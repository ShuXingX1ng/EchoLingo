"""
Onboarding Orchestrator — LangGraph Pipeline

Evaluates a new user's quick assessment responses, diagnoses their section
weaknesses, and generates a personalised first-week learning plan.

Graph:  score_all_tasks → diagnose → plan → finalize → END
         (parallel asyncio.gather inside score_all_tasks node)
"""

import asyncio
import json
import logging
from typing import Optional, TypedDict

from langgraph.graph import END, StateGraph

from models.schemas import PteFeedbackRequest
from services.feedback_graph import run_feedback_graph
from services.llm_chain import llm_chain

logger = logging.getLogger(__name__)

_LANG = (
    "All string values in your JSON response MUST be written in Simplified Chinese (简体中文). "
    "JSON keys stay in English."
)

# ─── State ────────────────────────────────────────────────────────────────────

class OnboardingState(TypedDict):
    tasks: list[dict]         # [{task_type, stimulus, response}]
    scored_tasks: list[dict]  # [{task_type, feedback}]
    weakness_profile: dict    # {section_scores, weakest_section, key_weaknesses, summary}
    learning_plan: dict       # {recommended_first_task, first_week, study_tips}
    final_result: dict


# ─── Node 1: score_all_tasks ──────────────────────────────────────────────────

async def _score_one(task: dict) -> dict:
    req = PteFeedbackRequest(
        taskType=task["task_type"],
        stimulus=task.get("stimulus", ""),
        response=task["response"],
    )
    try:
        feedback = await run_feedback_graph(req)
    except Exception as exc:
        logger.warning("[onboarding] scoring failed for %s: %s", task["task_type"], exc)
        feedback = {}
    return {"task_type": task["task_type"], "feedback": feedback}


async def score_all_tasks_node(state: OnboardingState) -> dict:
    """Fan-out: score every assessment task in parallel."""
    scored = await asyncio.gather(*[_score_one(t) for t in state["tasks"]])
    return {"scored_tasks": list(scored)}


# ─── Node 2: diagnose ─────────────────────────────────────────────────────────

_DIAGNOSE_SYSTEM = f"""
You are a PTE Academic diagnostic agent.
Given scored results from a quick onboarding assessment, synthesise the
learner's section-level weakness profile.

Output ONLY a JSON object with this exact schema:
{{
  "section_scores": {{
    "speaking": <integer 0-100 or null if not assessed>,
    "writing":  <integer 0-100 or null if not assessed>,
    "reading":  <integer 0-100 or null if not assessed>,
    "listening": <integer 0-100 or null if not assessed>
  }},
  "weakest_section": "<speaking|writing|reading|listening>",
  "key_weaknesses": ["<specific weakness>", "<specific weakness>"],
  "summary": "<2-sentence personalised diagnosis>"
}}

{_LANG}
""".strip()


async def diagnose_node(state: OnboardingState) -> dict:
    """LLM synthesises a weakness profile from all scored tasks."""
    payload = [
        {
            "task_type": t["task_type"],
            "dimensionScores": t["feedback"].get("dimensionScores"),
            "summary": t["feedback"].get("summary", ""),
            "weaknesses": t["feedback"].get("weaknesses", []),
        }
        for t in state["scored_tasks"]
    ]
    raw = await llm_chain.ainvoke(
        system=_DIAGNOSE_SYSTEM,
        user=f"Assessment results:\n{json.dumps(payload, ensure_ascii=False)}",
        temperature=0.2,
        max_tokens=400,
        json_mode=True,
        timeout=30.0,
    )
    try:
        profile = json.loads(raw or "{}")
    except Exception:
        profile = {}
    return {"weakness_profile": profile}


# ─── Node 3: plan ─────────────────────────────────────────────────────────────

_TASK_SLUGS = (
    "read_aloud, repeat_sentence, answer_short_question, summarize_written_text, "
    "write_essay, describe_image, re_tell_lecture, fill_in_the_blanks_reading, "
    "re_order_paragraphs, multiple_choice_reading, summarize_spoken_text, "
    "fill_in_the_blanks_listening, highlight_correct_summary, write_from_dictation"
)

_PLAN_SYSTEM = f"""
You are a PTE Academic study planner agent.
Given a learner's weakness profile, generate a personalised first-week plan
that prioritises their weakest areas while including variety.

Output ONLY a JSON object with this exact schema:
{{
  "recommended_first_task": "<one task slug from the list below>",
  "first_week": [
    {{"day": 1, "tasks": ["<task_slug>", "<task_slug>"], "focus": "<short focus description>"}},
    {{"day": 2, "tasks": ["<task_slug>"], "focus": "<short focus description>"}},
    {{"day": 3, "tasks": ["<task_slug>", "<task_slug>"], "focus": "<short focus description>"}}
  ],
  "study_tips": ["<actionable tip 1>", "<actionable tip 2>", "<actionable tip 3>"]
}}

Available task slugs: {_TASK_SLUGS}

{_LANG}
""".strip()


async def plan_node(state: OnboardingState) -> dict:
    """LLM generates a personalised first-week learning plan."""
    raw = await llm_chain.ainvoke(
        system=_PLAN_SYSTEM,
        user=f"Weakness profile:\n{json.dumps(state['weakness_profile'], ensure_ascii=False)}",
        temperature=0.4,
        max_tokens=600,
        json_mode=True,
        timeout=30.0,
    )
    try:
        plan = json.loads(raw or "{}")
    except Exception:
        plan = {}
    return {"learning_plan": plan}


# ─── Node 4: finalize ─────────────────────────────────────────────────────────

async def finalize_node(state: OnboardingState) -> dict:
    result = {
        "scoredTasks": state["scored_tasks"],
        "weaknessProfile": state["weakness_profile"],
        "learningPlan": state["learning_plan"],
    }
    logger.info(
        "[onboarding-graph] tasks=%d weakest=%s first_task=%s",
        len(state["scored_tasks"]),
        state["weakness_profile"].get("weakest_section", "unknown"),
        state["learning_plan"].get("recommended_first_task", "unknown"),
    )
    return {"final_result": result}


# ─── Graph construction ────────────────────────────────────────────────────────

def _build_graph():
    builder = StateGraph(OnboardingState)

    builder.add_node("score_all_tasks", score_all_tasks_node)
    builder.add_node("diagnose", diagnose_node)
    builder.add_node("plan", plan_node)
    builder.add_node("finalize", finalize_node)

    builder.set_entry_point("score_all_tasks")
    builder.add_edge("score_all_tasks", "diagnose")
    builder.add_edge("diagnose", "plan")
    builder.add_edge("plan", "finalize")
    builder.add_edge("finalize", END)

    return builder.compile()


_graph = _build_graph()


async def run_onboarding_graph(tasks: list[dict]) -> dict:
    """Entry point. Takes assessment task dicts, returns the onboarding result."""
    initial: OnboardingState = {
        "tasks": tasks,
        "scored_tasks": [],
        "weakness_profile": {},
        "learning_plan": {},
        "final_result": {},
    }
    result = await _graph.ainvoke(initial)
    return result.get("final_result") or {}
