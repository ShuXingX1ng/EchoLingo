"""
Unit tests for services/onboarding_graph.py

All LLM calls and the feedback graph are mocked — no network or API keys needed.
Tests cover each node in isolation and the full graph execution path.
"""

import json
import sys
import types
import pytest
from unittest.mock import AsyncMock, patch


# ── Stub heavy deps before importing ─────────────────────────────────────────

def _stub_vecs():
    vecs_mod = types.ModuleType("vecs")
    import unittest.mock as _m
    vecs_mod.create_client = _m.MagicMock()
    sys.modules.setdefault("vecs", vecs_mod)


_stub_vecs()

import services.onboarding_graph as og  # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────

def _base_state(**overrides) -> og.OnboardingState:
    state: og.OnboardingState = {
        "tasks": [
            {"task_type": "summarize_written_text", "stimulus": "AI is changing the world.", "response": "AI is transforming society."},
            {"task_type": "write_essay", "stimulus": "Describe your English goals.", "response": "I want to improve my academic writing."},
        ],
        "scored_tasks": [],
        "weakness_profile": {},
        "learning_plan": {},
        "final_result": {},
    }
    state.update(overrides)
    return state


_MOCK_FEEDBACK = {
    "summary": "Good effort.",
    "weaknesses": ["Grammar errors"],
    "dimensionScores": {"section": "writing", "grammar": 60, "vocabulary": 70, "form": 65, "content": 75},
}

_MOCK_PROFILE = {
    "section_scores": {"speaking": None, "writing": 68, "reading": None, "listening": None},
    "weakest_section": "writing",
    "key_weaknesses": ["Grammar accuracy", "Vocabulary range"],
    "summary": "你的写作需要重点提升。",
}

_MOCK_PLAN = {
    "recommended_first_task": "write_essay",
    "first_week": [
        {"day": 1, "tasks": ["write_essay"], "focus": "写作基础"},
    ],
    "study_tips": ["每天写一篇短文", "关注语法准确性"],
}


# ── score_all_tasks_node ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_score_all_tasks_runs_in_parallel():
    """Each task should be scored; results contain task_type and feedback."""
    with patch("services.onboarding_graph.run_feedback_graph", new_callable=AsyncMock) as mock_fb:
        mock_fb.return_value = _MOCK_FEEDBACK
        state = _base_state()
        result = await og.score_all_tasks_node(state)

    scored = result["scored_tasks"]
    assert len(scored) == 2
    assert scored[0]["task_type"] == "summarize_written_text"
    assert scored[1]["task_type"] == "write_essay"
    assert scored[0]["feedback"] == _MOCK_FEEDBACK
    assert mock_fb.call_count == 2


@pytest.mark.asyncio
async def test_score_all_tasks_handles_feedback_failure():
    """A scoring failure for one task should not crash the whole node."""
    with patch("services.onboarding_graph.run_feedback_graph", new_callable=AsyncMock) as mock_fb:
        mock_fb.side_effect = RuntimeError("LLM timeout")
        state = _base_state()
        result = await og.score_all_tasks_node(state)

    scored = result["scored_tasks"]
    assert len(scored) == 2
    assert scored[0]["feedback"] == {}


# ── diagnose_node ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_diagnose_node_returns_profile():
    with patch("services.onboarding_graph.llm_chain") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=json.dumps(_MOCK_PROFILE))
        state = _base_state(scored_tasks=[
            {"task_type": "write_essay", "feedback": _MOCK_FEEDBACK},
        ])
        result = await og.diagnose_node(state)

    assert result["weakness_profile"]["weakest_section"] == "writing"
    assert "key_weaknesses" in result["weakness_profile"]


@pytest.mark.asyncio
async def test_diagnose_node_handles_bad_json():
    with patch("services.onboarding_graph.llm_chain") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value="not json")
        state = _base_state(scored_tasks=[{"task_type": "write_essay", "feedback": {}}])
        result = await og.diagnose_node(state)

    assert result["weakness_profile"] == {}


# ── plan_node ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_plan_node_returns_plan():
    with patch("services.onboarding_graph.llm_chain") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=json.dumps(_MOCK_PLAN))
        state = _base_state(weakness_profile=_MOCK_PROFILE)
        result = await og.plan_node(state)

    plan = result["learning_plan"]
    assert plan["recommended_first_task"] == "write_essay"
    assert len(plan["first_week"]) == 1
    assert len(plan["study_tips"]) == 2


@pytest.mark.asyncio
async def test_plan_node_handles_bad_json():
    with patch("services.onboarding_graph.llm_chain") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value="")
        state = _base_state(weakness_profile=_MOCK_PROFILE)
        result = await og.plan_node(state)

    assert result["learning_plan"] == {}


# ── finalize_node ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_finalize_node_assembles_result():
    scored = [{"task_type": "write_essay", "feedback": _MOCK_FEEDBACK}]
    state = _base_state(
        scored_tasks=scored,
        weakness_profile=_MOCK_PROFILE,
        learning_plan=_MOCK_PLAN,
    )
    result = await og.finalize_node(state)

    fr = result["final_result"]
    assert "scoredTasks" in fr
    assert "weaknessProfile" in fr
    assert "learningPlan" in fr
    assert fr["weaknessProfile"]["weakest_section"] == "writing"
    assert fr["learningPlan"]["recommended_first_task"] == "write_essay"


# ── run_onboarding_graph (full pipeline) ─────────────────────────────────────

@pytest.mark.asyncio
async def test_run_onboarding_graph_full_pipeline():
    """Smoke test: full graph invocation with all nodes mocked."""
    with (
        patch("services.onboarding_graph.run_feedback_graph", new_callable=AsyncMock) as mock_fb,
        patch("services.onboarding_graph.llm_chain") as mock_llm,
    ):
        mock_fb.return_value = _MOCK_FEEDBACK
        # diagnose call then plan call
        mock_llm.ainvoke = AsyncMock(
            side_effect=[json.dumps(_MOCK_PROFILE), json.dumps(_MOCK_PLAN)]
        )
        tasks = [
            {"task_type": "summarize_written_text", "stimulus": "AI is changing society.", "response": "AI transforms society."},
        ]
        result = await og.run_onboarding_graph(tasks)

    assert "scoredTasks" in result
    assert result["weaknessProfile"]["weakest_section"] == "writing"
    assert result["learningPlan"]["recommended_first_task"] == "write_essay"
