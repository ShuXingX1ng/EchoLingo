"""
Tests for PTE Feedback API (POST /api/pte/feedback).
Covers all four section types (Speaking, Writing, Reading, Listening)
and the LLM-as-Judge divergence/retry pipeline.

Mocks run_feedback_graph so the router tests are decoupled from graph internals.
"""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


def _speaking_result(**overrides):
    data = {
        "summary": "Good attempt at reading aloud with clear pronunciation.",
        "strengths": ["Clear articulation", "Good pace"],
        "weaknesses": ["Minor hesitation on long words"],
        "suggestions": ["Practice tongue twisters", "Record yourself regularly"],
        "details": {
            "taskType": "read_aloud",
            "oralFluency": "Mostly fluent with one pause.",
            "pronunciation": "Clear and accurate.",
        },
        "dimensionScores": {"section": "speaking", "fluency": 75, "pronunciation": 80, "content": 70},
        "coachSuggestions": ["Focus on reducing mid-sentence pauses.", "Work on stress patterns."],
    }
    data.update(overrides)
    return data


def _writing_result(**overrides):
    data = {
        "summary": "Well-structured essay with good vocabulary range.",
        "strengths": ["Clear argument", "Varied vocabulary"],
        "weaknesses": ["Some grammar errors"],
        "suggestions": ["Review subject-verb agreement"],
        "details": {"taskType": "write_essay", "content": "Good task response."},
        "dimensionScores": {"section": "writing", "grammar": 72, "vocabulary": 80, "form": 78, "content": 75},
        "coachSuggestions": ["Focus on grammar accuracy."],
    }
    data.update(overrides)
    return data


def _reading_result(**overrides):
    data = {
        "summary": "Good reading comprehension.",
        "strengths": ["Correct on 4/5 blanks"],
        "weaknesses": ["Missed one blank"],
        "suggestions": ["Re-read surrounding sentences"],
        "details": {"taskType": "fill_in_the_blanks_reading", "accuracy": "4/5 correct."},
        "dimensionScores": {"section": "reading", "vocabulary": 78, "comprehension": 82},
        "coachSuggestions": ["Focus on collocations."],
    }
    data.update(overrides)
    return data


def _listening_result(**overrides):
    data = {
        "summary": "Good listening comprehension.",
        "strengths": ["Captured main idea"],
        "weaknesses": ["Missed one detail"],
        "suggestions": ["Focus on key content words"],
        "details": {"taskType": "summarize_spoken_text", "contentAccuracy": "Main idea captured."},
        "dimensionScores": {"section": "listening", "comprehension": 76, "accuracy": 80},
        "coachSuggestions": ["Practice note-taking."],
    }
    data.update(overrides)
    return data


@pytest.mark.anyio
async def test_feedback_missing_task_type():
    """Request missing taskType returns 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/pte/feedback",
            json={"stimulus": "test", "response": "test response"},
        )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_feedback_empty_response():
    """Empty candidate response returns 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/pte/feedback",
            json={"taskType": "read_aloud", "stimulus": "some passage", "response": "   "},
        )
    assert response.status_code == 400


@pytest.mark.anyio
async def test_feedback_invalid_task_type():
    """Unknown taskType returns 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/pte/feedback",
            json={"taskType": "unknown_type", "response": "some response"},
        )
    assert response.status_code == 400


@pytest.mark.anyio
async def test_feedback_speaking_task():
    """Speaking task returns feedback with speaking dimensionScores."""
    with patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as mock_graph:
        mock_graph.return_value = _speaking_result()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={"taskType": "read_aloud", "stimulus": "The quick brown fox.", "response": "The quick brown fox."},
            )

    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "strengths" in data
    assert "weaknesses" in data
    assert data["dimensionScores"]["section"] == "speaking"
    assert "fluency" in data["dimensionScores"]
    assert "coachSuggestions" in data


@pytest.mark.anyio
async def test_feedback_writing_task():
    """Writing task returns feedback with writing dimensionScores."""
    with patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as mock_graph:
        mock_graph.return_value = _writing_result()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={"taskType": "write_essay", "stimulus": "Discuss the impact of AI.", "response": "AI has transformed many industries..."},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["dimensionScores"]["section"] == "writing"
    assert "grammar" in data["dimensionScores"]


@pytest.mark.anyio
async def test_feedback_reading_task():
    """Reading task returns feedback with reading dimensionScores."""
    with patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as mock_graph:
        mock_graph.return_value = _reading_result()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={
                    "taskType": "fill_in_the_blanks_reading",
                    "stimulus": "Passage with correct answers marked.",
                    "response": "Blank 1: selected 'collect' (correct) ✓",
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert data["dimensionScores"]["section"] == "reading"
    assert "comprehension" in data["dimensionScores"]


@pytest.mark.anyio
async def test_feedback_listening_task():
    """Listening task returns feedback with listening dimensionScores."""
    with patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as mock_graph:
        mock_graph.return_value = _listening_result()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={
                    "taskType": "summarize_spoken_text",
                    "stimulus": "Academic passage text here.",
                    "response": "The passage discusses renewable energy.",
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert data["dimensionScores"]["section"] == "listening"
    assert "accuracy" in data["dimensionScores"]


@pytest.mark.anyio
async def test_feedback_unscored_task_no_dimension_scores():
    """Unscored task (write_from_dictation) returns feedback without dimensionScores."""
    unscored_result = {
        "summary": "Mostly accurate transcription with one spelling error.",
        "strengths": ["Captured sentence structure"],
        "weaknesses": ["Misspelled 'necessary'"],
        "suggestions": ["Focus on common academic word spellings"],
        "details": {"taskType": "write_from_dictation", "wordAccuracy": "9 of 10 words correct."},
    }
    with patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as mock_graph:
        mock_graph.return_value = unscored_result
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={
                    "taskType": "write_from_dictation",
                    "stimulus": "The committee reviewed the proposal carefully.",
                    "response": "The comittee reviewed the proposal carefully.",
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "dimensionScores" not in data


@pytest.mark.anyio
async def test_feedback_judge_divergence_triggers_retry():
    """When the graph detects divergence, judgeLog is present in the result."""
    result_with_judge_log = _speaking_result(
        dimensionScores={"section": "speaking", "fluency": 65, "pronunciation": 80, "content": 70},
        judgeLog={
            "taskType": "read_aloud",
            "divergedDimensions": [{"dimension": "fluency", "primaryScore": 50, "judgeScore": 80}],
            "timestamp": "2026-01-01T00:00:00+00:00",
        },
    )
    with patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as mock_graph:
        mock_graph.return_value = result_with_judge_log
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={"taskType": "read_aloud", "stimulus": "Test passage.", "response": "Test passage."},
            )

    assert response.status_code == 200
    data = response.json()
    assert "judgeLog" in data
    assert data["judgeLog"]["taskType"] == "read_aloud"
    diverged = data["judgeLog"]["divergedDimensions"]
    assert any(d["dimension"] == "fluency" for d in diverged)


@pytest.mark.anyio
async def test_feedback_pronunciation_assessment_merged():
    """pronunciationAssessment from the graph result is returned in the response."""
    pron = {
        "score": 85,
        "accuracyScore": 82,
        "fluencyScore": 88,
        "completenessScore": 91,
        "words": [{"word": "hello", "score": 90, "accuracyScore": 88}],
        "summary": "Good pronunciation.",
    }
    result = _speaking_result(pronunciationAssessment=pron)
    with patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as mock_graph:
        mock_graph.return_value = result
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={
                    "taskType": "read_aloud",
                    "stimulus": "The quick brown fox.",
                    "response": "The quick brown fox.",
                    "pronunciationAssessment": pron,
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert "pronunciationAssessment" in data
    assert data["pronunciationAssessment"]["score"] == 85


@pytest.mark.anyio
async def test_feedback_llm_not_configured():
    """Returns 502 when the graph raises ValueError (e.g. LLM_API_KEY missing)."""
    with patch("routers.pte_feedback.run_feedback_graph", new_callable=AsyncMock) as mock_graph:
        mock_graph.side_effect = ValueError("LLM_API_KEY is not set.")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={"taskType": "read_aloud", "stimulus": "test", "response": "test response"},
            )
    assert response.status_code == 502
