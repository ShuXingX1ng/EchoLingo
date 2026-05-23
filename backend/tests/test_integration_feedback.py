"""
Integration tests for Feedback API - structured response generation, JSON parsing, edge cases.
"""
import json
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


MOCK_FEEDBACK = json.dumps({
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
            "explanation": "Remove am - simple present tense"
        }
    ],
})


@pytest.mark.anyio
async def test_feedback_full_session_flow():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = MOCK_FEEDBACK
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Tell me about your hometown.", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "I come from Beijing. It is a big city.", "createdAt": "2024-01-01T00:00:01Z"},
                    {"id": "3", "role": "examiner", "content": "What do you like about it?", "createdAt": "2024-01-01T00:00:02Z"},
                    {"id": "4", "role": "user", "content": "I like the food and the culture there.", "createdAt": "2024-01-01T00:00:03Z"},
                ],
            })

    assert response.status_code == 200
    data = response.json()
    assert data["estimatedBand"] == 6.5
    assert len(data["strengths"]) == 2
    assert len(data["improvementSuggestions"]) == 3
    assert data["errorAnnotations"] is not None


@pytest.mark.anyio
async def test_feedback_llm_called_with_correct_params():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = MOCK_FEEDBACK
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    mock_llm.assert_called_once()
    call_kwargs = mock_llm.call_args.kwargs
    assert call_kwargs["temperature"] == 0.3
    assert call_kwargs["max_tokens"] == 3000
    assert call_kwargs["timeout"] == 120.0
    assert call_kwargs["response_format"] == {"type": "json_object"}


@pytest.mark.anyio
async def test_feedback_transcript_formatting():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = MOCK_FEEDBACK
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Hello!", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "Hi there!", "createdAt": "2024-01-01T00:00:01Z"},
                ],
            })

    call_args = mock_llm.call_args
    messages = call_args.kwargs.get("messages", call_args[1].get("messages", []))
    user_msg = messages[1]["content"]
    assert "Examiner: Hello!" in user_msg
    assert "Candidate: Hi there!" in user_msg


@pytest.mark.anyio
async def test_feedback_json_with_extra_text():
    response_with_extra = "Here is the feedback: " + MOCK_FEEDBACK
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = response_with_extra
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 200
    data = response.json()
    assert data["estimatedBand"] == 6.5


@pytest.mark.anyio
async def test_feedback_malformed_json_from_llm():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "This is not JSON at all, just random text."
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 502
    assert "Invalid feedback format" in response.json()["detail"]


@pytest.mark.anyio
async def test_feedback_missing_required_fields_in_json():
    incomplete_json = json.dumps({"estimatedBand": 5.0})
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = incomplete_json
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    # Feedback API returns 502 when LLM response cannot be parsed
    assert response.status_code in [422, 502]


@pytest.mark.anyio
async def test_feedback_part2_mode():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = MOCK_FEEDBACK
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_2",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Describe your hometown.", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "My hometown is beautiful.", "createdAt": "2024-01-01T00:00:01Z"},
                ],
            })

    assert response.status_code == 200
    assert response.json()["estimatedBand"] == 6.5


@pytest.mark.anyio
async def test_feedback_part3_mode():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = MOCK_FEEDBACK
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_3",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Why do people move to cities?", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "For better opportunities.", "createdAt": "2024-01-01T00:00:01Z"},
                ],
            })

    assert response.status_code == 200
    assert response.json()["estimatedBand"] == 6.5


@pytest.mark.anyio
async def test_feedback_invalid_mode():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/feedback", json={
            "mode": "invalid_mode",
            "messages": [
                {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
            ],
        })
    assert response.status_code == 422
