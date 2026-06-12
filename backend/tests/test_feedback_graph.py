"""
Node-level unit tests for services/feedback_graph.py.

All LLM and RAG calls are mocked — no network or API keys required.
Tests exercise each node in isolation plus the divergence-routing logic.
"""

import json
import sys
import types
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Stub heavy optional dependencies before importing the graph
# ---------------------------------------------------------------------------

def _stub_vecs():
    vecs_mod = types.ModuleType("vecs")
    vecs_mod.create_client = MagicMock()
    sys.modules.setdefault("vecs", vecs_mod)


_stub_vecs()

import importlib
import services.vector_store   # noqa: E402
import services.rag            # noqa: E402
import services.feedback_graph as fg  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _base_state(**overrides) -> fg.FeedbackState:
    state: fg.FeedbackState = {
        "task_type": "read_aloud",
        "stimulus": "The quick brown fox.",
        "response": "The quick brown fox.",
        "pron_assessment": None,
        "retrieved_context": "",
        "primary_result": None,
        "judge_result": None,
        "diverged": [],
        "retry_count": 0,
        "final_result": {},
    }
    state.update(overrides)
    return state


def _speaking_primary(fluency=75, pronunciation=80, content=70) -> dict:
    return {
        "summary": "Good attempt.",
        "strengths": ["Clear articulation"],
        "weaknesses": ["Minor hesitation"],
        "suggestions": ["Practice more"],
        "details": {"taskType": "read_aloud", "oralFluency": "Mostly fluent."},
        "dimensionScores": {"section": "speaking", "fluency": fluency, "pronunciation": pronunciation, "content": content},
        "coachSuggestions": ["Reduce pauses."],
    }


def _speaking_judge(fluency=74, pronunciation=79, content=71) -> dict:
    return {"dimensionScores": {"section": "speaking", "fluency": fluency, "pronunciation": pronunciation, "content": content}}


# ---------------------------------------------------------------------------
# retrieve_context_node
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_retrieve_context_node_returns_text():
    state = _base_state()
    with patch("services.rag.aembed_query", new=AsyncMock(return_value=[0.1] * 1536)), \
         patch("services.rag.get_vecs_collection") as mock_factory:
        mock_col = MagicMock()
        mock_col.query.return_value = [("id-1", {"text": "Rubric chunk A."}, 0.9)]
        mock_factory.return_value = mock_col

        result = await fg.retrieve_context_node(state)

    assert result == {"retrieved_context": "Rubric chunk A."}


@pytest.mark.anyio
async def test_retrieve_context_node_returns_empty_on_error():
    state = _base_state()
    with patch("services.rag.aembed_query", new=AsyncMock(side_effect=RuntimeError("db down"))):
        result = await fg.retrieve_context_node(state)

    assert result == {"retrieved_context": ""}


# ---------------------------------------------------------------------------
# call_primary_node
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_call_primary_node_parses_result():
    primary_json = json.dumps(_speaking_primary())
    state = _base_state(retrieved_context="Some rubric text.")

    with patch("services.feedback_graph.llm_chain") as mock_chain:
        mock_chain.ainvoke = AsyncMock(return_value=primary_json)
        result = await fg.call_primary_node(state)

    assert result["primary_result"] is not None
    assert result["primary_result"]["dimensionScores"]["section"] == "speaking"


@pytest.mark.anyio
async def test_call_primary_node_injects_rubric_into_system():
    state = _base_state(retrieved_context="Important rubric content.")
    captured = {}

    async def capture_ainvoke(**kwargs):
        captured.update(kwargs)
        return json.dumps(_speaking_primary())

    with patch("services.feedback_graph.llm_chain") as mock_chain:
        mock_chain.ainvoke = AsyncMock(side_effect=capture_ainvoke)
        await fg.call_primary_node(state)

    assert "Important rubric content." in captured["system"]


@pytest.mark.anyio
async def test_call_primary_node_returns_none_on_bad_json():
    state = _base_state()
    with patch("services.feedback_graph.llm_chain") as mock_chain:
        mock_chain.ainvoke = AsyncMock(return_value="not json at all")
        result = await fg.call_primary_node(state)

    assert result["primary_result"] is None


# ---------------------------------------------------------------------------
# call_judge_node
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_call_judge_node_scored_task():
    state = _base_state(task_type="read_aloud")
    judge_json = json.dumps(_speaking_judge())

    with patch("services.feedback_graph.llm_chain") as mock_chain:
        mock_chain.ainvoke = AsyncMock(return_value=judge_json)
        result = await fg.call_judge_node(state)

    assert result["judge_result"] is not None
    assert result["judge_result"]["dimensionScores"]["section"] == "speaking"


@pytest.mark.anyio
async def test_call_judge_node_unscored_task_returns_none():
    state = _base_state(task_type="write_from_dictation")
    with patch("services.feedback_graph.llm_chain") as mock_chain:
        mock_chain.ainvoke = AsyncMock(return_value="{}")
        result = await fg.call_judge_node(state)

    assert result == {"judge_result": None}
    mock_chain.ainvoke.assert_not_called()


@pytest.mark.anyio
async def test_call_judge_node_silences_exception():
    state = _base_state(task_type="read_aloud")
    with patch("services.feedback_graph.llm_chain") as mock_chain:
        mock_chain.ainvoke = AsyncMock(side_effect=RuntimeError("timeout"))
        result = await fg.call_judge_node(state)

    assert result == {"judge_result": None}


# ---------------------------------------------------------------------------
# check_divergence_node
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_check_divergence_no_divergence():
    primary = _speaking_primary(fluency=75, pronunciation=80, content=70)
    judge = _speaking_judge(fluency=74, pronunciation=79, content=71)
    state = _base_state(primary_result=primary, judge_result=judge)

    result = await fg.check_divergence_node(state)

    assert result["diverged"] == []


@pytest.mark.anyio
async def test_check_divergence_detects_diverged_dimension():
    # fluency gap: |50 - 80| = 30 > 15
    primary = _speaking_primary(fluency=50, pronunciation=80, content=70)
    judge = _speaking_judge(fluency=80, pronunciation=81, content=71)
    state = _base_state(primary_result=primary, judge_result=judge)

    result = await fg.check_divergence_node(state)

    assert len(result["diverged"]) == 1
    assert result["diverged"][0]["dimension"] == "fluency"
    assert result["diverged"][0]["primaryScore"] == 50
    assert result["diverged"][0]["judgeScore"] == 80


@pytest.mark.anyio
async def test_check_divergence_no_primary():
    state = _base_state(primary_result=None, judge_result=_speaking_judge())
    result = await fg.check_divergence_node(state)
    assert result["diverged"] == []


@pytest.mark.anyio
async def test_check_divergence_no_judge():
    state = _base_state(primary_result=_speaking_primary(), judge_result=None)
    result = await fg.check_divergence_node(state)
    assert result["diverged"] == []


# ---------------------------------------------------------------------------
# _route_after_divergence (routing function)
# ---------------------------------------------------------------------------

def test_route_diverged_goes_to_retry():
    state = _base_state(diverged=[{"dimension": "fluency", "primaryScore": 50, "judgeScore": 80}])
    assert fg._route_after_divergence(state) == "retry_primary"


def test_route_no_divergence_goes_to_finalize():
    state = _base_state(diverged=[])
    assert fg._route_after_divergence(state) == "finalize"


# ---------------------------------------------------------------------------
# retry_primary_node
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_retry_primary_node_updates_primary_result():
    diverged = [{"dimension": "fluency", "primaryScore": 50, "judgeScore": 80}]
    new_primary = _speaking_primary(fluency=65)
    state = _base_state(
        diverged=diverged,
        primary_result=_speaking_primary(fluency=50),
        retry_count=0,
    )

    with patch("services.feedback_graph.llm_chain") as mock_chain:
        mock_chain.ainvoke = AsyncMock(return_value=json.dumps(new_primary))
        result = await fg.retry_primary_node(state)

    assert result["primary_result"]["dimensionScores"]["fluency"] == 65
    assert result["retry_count"] == 1


@pytest.mark.anyio
async def test_retry_primary_node_keeps_original_on_llm_error():
    diverged = [{"dimension": "fluency", "primaryScore": 50, "judgeScore": 80}]
    original = _speaking_primary(fluency=50)
    state = _base_state(diverged=diverged, primary_result=original, retry_count=0)

    with patch("services.feedback_graph.llm_chain") as mock_chain:
        mock_chain.ainvoke = AsyncMock(side_effect=RuntimeError("network error"))
        result = await fg.retry_primary_node(state)

    # primary_result not updated, retry_count incremented
    assert "primary_result" not in result
    assert result["retry_count"] == 1


# ---------------------------------------------------------------------------
# finalize_node
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_finalize_node_no_pron_no_divergence():
    primary = _speaking_primary()
    state = _base_state(primary_result=primary, pron_assessment=None, diverged=[])
    result = await fg.finalize_node(state)

    assert "pronunciationAssessment" not in result["final_result"]
    assert "judgeLog" not in result["final_result"]
    assert result["final_result"]["dimensionScores"]["section"] == "speaking"


@pytest.mark.anyio
async def test_finalize_node_merges_pron_assessment():
    pron = {"score": 85, "accuracyScore": 82, "fluencyScore": 88, "completenessScore": 91}
    state = _base_state(primary_result=_speaking_primary(), pron_assessment=pron, diverged=[])
    result = await fg.finalize_node(state)

    assert result["final_result"]["pronunciationAssessment"] == pron


@pytest.mark.anyio
async def test_finalize_node_attaches_judge_log_on_divergence():
    diverged = [{"dimension": "fluency", "primaryScore": 50, "judgeScore": 80}]
    state = _base_state(
        task_type="read_aloud",
        primary_result=_speaking_primary(),
        diverged=diverged,
    )
    result = await fg.finalize_node(state)

    assert "judgeLog" in result["final_result"]
    assert result["final_result"]["judgeLog"]["taskType"] == "read_aloud"
    assert result["final_result"]["judgeLog"]["divergedDimensions"] == diverged


# ---------------------------------------------------------------------------
# run_feedback_graph (end-to-end with mocked I/O)
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_run_feedback_graph_happy_path():
    primary_json = json.dumps(_speaking_primary())
    judge_json = json.dumps(_speaking_judge())

    class FakeRequest:
        taskType = "read_aloud"
        stimulus = "The quick brown fox."
        response = "The quick brown fox."
        pronunciationAssessment = None

    with (
        patch("services.rag.aembed_query", new=AsyncMock(return_value=[0.0] * 1536)),
        patch("services.rag.get_vecs_collection") as mock_factory,
        patch("services.feedback_graph.llm_chain") as mock_chain,
    ):
        mock_col = MagicMock()
        mock_col.query.return_value = []
        mock_factory.return_value = mock_col
        mock_chain.ainvoke = AsyncMock(side_effect=[primary_json, judge_json])

        result = await fg.run_feedback_graph(FakeRequest())

    assert result["dimensionScores"]["section"] == "speaking"
    assert "judgeLog" not in result  # no divergence


@pytest.mark.anyio
async def test_run_feedback_graph_divergence_triggers_retry():
    primary_v1 = json.dumps(_speaking_primary(fluency=50))
    judge_json  = json.dumps(_speaking_judge(fluency=80))   # gap = 30 > 15
    primary_v2  = json.dumps(_speaking_primary(fluency=65))

    class FakeRequest:
        taskType = "read_aloud"
        stimulus = "Test."
        response = "Test."
        pronunciationAssessment = None

    with (
        patch("services.rag.aembed_query", new=AsyncMock(return_value=[0.0] * 1536)),
        patch("services.rag.get_vecs_collection") as mock_factory,
        patch("services.feedback_graph.llm_chain") as mock_chain,
    ):
        mock_col = MagicMock()
        mock_col.query.return_value = []
        mock_factory.return_value = mock_col
        # parallel: primary_v1 + judge_json; then retry: primary_v2
        mock_chain.ainvoke = AsyncMock(side_effect=[primary_v1, judge_json, primary_v2])

        result = await fg.run_feedback_graph(FakeRequest())

    assert "judgeLog" in result
    assert any(d["dimension"] == "fluency" for d in result["judgeLog"]["divergedDimensions"])
    assert result["dimensionScores"]["fluency"] == 65
