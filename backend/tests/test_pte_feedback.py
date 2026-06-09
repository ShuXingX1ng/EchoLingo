"""
Tests for PTE Feedback API (POST /api/pte/feedback).
Covers all four section types (Speaking, Writing, Reading, Listening)
and the LLM-as-Judge divergence/retry pipeline.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


def _make_speaking_feedback(**overrides) -> str:
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
    return json.dumps(data)


def _make_writing_feedback(**overrides) -> str:
    data = {
        "summary": "Well-structured essay with good vocabulary range.",
        "strengths": ["Clear argument", "Varied vocabulary"],
        "weaknesses": ["Some grammar errors"],
        "suggestions": ["Review subject-verb agreement", "Add more complex sentences"],
        "details": {
            "taskType": "write_essay",
            "content": "Good task response.",
            "grammar": "Minor errors.",
            "vocabulary": "Wide range.",
            "structure": "Well-organised.",
        },
        "dimensionScores": {"section": "writing", "grammar": 72, "vocabulary": 80, "form": 78, "content": 75},
        "coachSuggestions": ["Focus on grammar accuracy.", "Expand use of academic vocabulary."],
    }
    data.update(overrides)
    return json.dumps(data)


def _make_reading_feedback(**overrides) -> str:
    data = {
        "summary": "Good reading comprehension with mostly correct blank selections.",
        "strengths": ["Correct on 4/5 blanks", "Good vocabulary recognition"],
        "weaknesses": ["Missed one blank due to context misread"],
        "suggestions": ["Re-read surrounding sentences for context clues"],
        "details": {
            "taskType": "fill_in_the_blanks_reading",
            "accuracy": "4 out of 5 correct.",
            "vocabulary": "Good recognition of academic vocabulary.",
        },
        "dimensionScores": {"section": "reading", "vocabulary": 78, "comprehension": 82},
        "coachSuggestions": ["Focus on understanding word collocations.", "Skim for context before selecting."],
    }
    data.update(overrides)
    return json.dumps(data)


def _make_listening_feedback(**overrides) -> str:
    data = {
        "summary": "Good listening comprehension with accurate summary.",
        "strengths": ["Captured main idea", "Good word count (58 words)"],
        "weaknesses": ["Missed one supporting detail"],
        "suggestions": ["Focus on key content words while listening"],
        "details": {
            "taskType": "summarize_spoken_text",
            "contentAccuracy": "Main idea captured, one detail missed.",
            "writingQuality": "Grammar and vocabulary adequate. Word count within range.",
        },
        "dimensionScores": {"section": "listening", "comprehension": 76, "accuracy": 80},
        "coachSuggestions": ["Practice note-taking while listening.", "Focus on topic sentences."],
    }
    data.update(overrides)
    return json.dumps(data)


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
    primary = _make_speaking_feedback()
    judge = json.dumps({"dimensionScores": {"section": "speaking", "fluency": 74, "pronunciation": 79, "content": 71}})

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [primary, judge]

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
    primary = _make_writing_feedback()
    judge = json.dumps({"dimensionScores": {"section": "writing", "grammar": 70, "vocabulary": 79, "form": 77, "content": 74}})

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [primary, judge]

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
    primary = _make_reading_feedback()
    judge = json.dumps({"dimensionScores": {"section": "reading", "vocabulary": 77, "comprehension": 81}})

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [primary, judge]

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
    primary = _make_listening_feedback()
    judge = json.dumps({"dimensionScores": {"section": "listening", "comprehension": 75, "accuracy": 79}})

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [primary, judge]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={
                    "taskType": "summarize_spoken_text",
                    "stimulus": "Academic passage text here.",
                    "response": "The passage discusses the importance of renewable energy sources.",
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert data["dimensionScores"]["section"] == "listening"
    assert "accuracy" in data["dimensionScores"]


@pytest.mark.anyio
async def test_feedback_unscored_task_no_dimension_scores():
    """Unscored task (write_from_dictation) returns feedback without dimensionScores."""
    payload = json.dumps({
        "summary": "Mostly accurate transcription with one spelling error.",
        "strengths": ["Captured sentence structure"],
        "weaknesses": ["Misspelled 'necessary'"],
        "suggestions": ["Focus on common academic word spellings"],
        "details": {"taskType": "write_from_dictation", "wordAccuracy": "9 of 10 words correct."},
    })

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [payload, None]  # judge returns None for unscored tasks

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
    """When judge diverges > 15 pts on a dimension, primary is retried and judgeLog is attached."""
    primary_v1 = _make_speaking_feedback(
        dimensionScores={"section": "speaking", "fluency": 50, "pronunciation": 80, "content": 70}
    )
    # Judge scores fluency at 80 → divergence = 30 (> 15) → retry
    judge = json.dumps({"dimensionScores": {"section": "speaking", "fluency": 80, "pronunciation": 81, "content": 71}})
    primary_v2 = _make_speaking_feedback(
        dimensionScores={"section": "speaking", "fluency": 65, "pronunciation": 80, "content": 70}
    )

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        # Call order: primary, judge (parallel), then retry (sequential)
        mock_llm.side_effect = [primary_v1, judge, primary_v2]

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
    # call_llm should have been called 3 times: primary + judge + retry
    assert mock_llm.call_count == 3


@pytest.mark.anyio
async def test_feedback_pronunciation_assessment_merged():
    """pronunciationAssessment from request is attached to the feedback response."""
    primary = _make_speaking_feedback()
    judge = json.dumps({"dimensionScores": {"section": "speaking", "fluency": 74, "pronunciation": 79, "content": 71}})

    pron = {
        "score": 85,
        "accuracyScore": 82,
        "fluencyScore": 88,
        "completenessScore": 91,
        "words": [{"word": "hello", "score": 90, "accuracyScore": 88}],
        "summary": "Good pronunciation.",
    }

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = [primary, judge]

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
    """Returns 502 when LLM service is not configured."""
    with patch("services.llm.llm_service.is_configured", return_value=False):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/feedback",
                json={"taskType": "read_aloud", "stimulus": "test", "response": "test response"},
            )
    assert response.status_code == 502
