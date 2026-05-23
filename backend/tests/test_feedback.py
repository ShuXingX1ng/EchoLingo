"""
Tests for Feedback API.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


MOCK_FEEDBACK_RESPONSE = json.dumps({
    "estimatedBand": 6.5,
    "fluencyAndCoherence": "Good fluency with minor hesitations.",
    "lexicalResource": "Adequate vocabulary range.",
    "grammarRangeAndAccuracy": "Mix of simple and complex structures.",
    "pronunciation": "Clear pronunciation overall.",
    "strengths": ["Good use of examples", "Clear structure"],
    "weaknesses": ["Limited complex vocabulary"],
    "improvementSuggestions": [
        "Practice using more advanced vocabulary",
        "Work on linking words",
        "Expand answers with more details",
    ],
    "improvedSampleAnswer": "I come from a bustling city that offers numerous opportunities...",
    "errorAnnotations": [
        {
            "original": "I am go to school",
            "corrected": "I go to school",
            "type": "grammar",
            "explanation": "Remove 'am' - simple present tense doesn't need auxiliary verb"
        }
    ],
})


@pytest.mark.anyio
async def test_feedback_missing_messages():
    """Test feedback endpoint rejects empty messages."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/feedback",
            json={"mode": "ielts_part_1", "messages": []},
        )
    assert response.status_code == 400  # Manual validation in route handler


@pytest.mark.anyio
async def test_feedback_success():
    """Test feedback endpoint returns valid SessionFeedback with mocked LLM."""
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = MOCK_FEEDBACK_RESPONSE

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/feedback",
                json={
                    "mode": "ielts_part_1",
                    "messages": [
                        {
                            "id": "1",
                            "role": "examiner",
                            "content": "Tell me about your hometown.",
                            "createdAt": "2024-01-01T00:00:00Z",
                        },
                        {
                            "id": "2",
                            "role": "user",
                            "content": "I come from Beijing. It is a big city.",
                            "createdAt": "2024-01-01T00:00:01Z",
                        },
                    ],
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert data["estimatedBand"] == 6.5
    assert "fluencyAndCoherence" in data
    assert "lexicalResource" in data
    assert "grammarRangeAndAccuracy" in data
    assert "pronunciation" in data
    assert "strengths" in data
    assert "weaknesses" in data
    assert "improvementSuggestions" in data
    assert "improvedSampleAnswer" in data
    assert "errorAnnotations" in data


@pytest.mark.anyio
async def test_feedback_json_in_markdown():
    """Test feedback endpoint handles JSON wrapped in markdown code blocks."""
    markdown_response = f"```json\n{MOCK_FEEDBACK_RESPONSE}\n```"

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = markdown_response

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/feedback",
                json={
                    "mode": "ielts_part_1",
                    "messages": [
                        {
                            "id": "1",
                            "role": "user",
                            "content": "Hello",
                            "createdAt": "2024-01-01T00:00:00Z",
                        }
                    ],
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert data["estimatedBand"] == 6.5


@pytest.mark.anyio
async def test_feedback_llm_not_configured():
    """Test feedback endpoint handles unconfigured LLM."""
    with patch("services.llm.llm_service.is_configured", return_value=False):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/feedback",
                json={
                    "mode": "ielts_part_1",
                    "messages": [
                        {
                            "id": "1",
                            "role": "user",
                            "content": "Hello",
                            "createdAt": "2024-01-01T00:00:00Z",
                        }
                    ],
                },
            )

    assert response.status_code == 502
