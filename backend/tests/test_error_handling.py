"""
Error handling tests - LLM failures, Azure unavailability, invalid inputs, edge cases.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
import httpx
from main import app


def _make_examiner_mock(side_effect=None, return_value=None):
    mock_chain = MagicMock()
    if side_effect is not None:
        mock_chain.ainvoke = AsyncMock(side_effect=side_effect)
    else:
        mock_chain.ainvoke = AsyncMock(return_value=return_value)
    mock_llm = MagicMock()
    mock_llm.__or__ = MagicMock(return_value=mock_chain)
    return mock_llm


# ============================================================
# LLM Error Handling
# ============================================================

@pytest.mark.anyio
async def test_examiner_llm_timeout():
    mock_llm = _make_examiner_mock(side_effect=httpx.TimeoutException("Connection timed out"))
    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 500


@pytest.mark.anyio
async def test_examiner_llm_value_error():
    mock_llm = _make_examiner_mock(side_effect=ValueError("LLM API configuration is missing."))
    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 502


@pytest.mark.anyio
async def test_feedback_llm_timeout():
    with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
        mock_ainvoke.side_effect = httpx.TimeoutException("Request timed out")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 500


@pytest.mark.anyio
async def test_feedback_llm_empty_response():
    with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
        mock_ainvoke.side_effect = ValueError("The AI returned an empty response.")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 502


@pytest.mark.anyio
async def test_feedback_llm_rate_limit():
    with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
        mock_ainvoke.side_effect = ValueError("Rate limit exceeded. Please wait a moment and try again.")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 502
    assert "Rate limit" in response.json()["detail"]


# ============================================================
# Azure Speech Error Handling
# ============================================================

@pytest.mark.anyio
async def test_tts_azure_synthesis_failure():
    with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
        mock_tts.side_effect = ValueError("Speech synthesis failed: Connection error")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={
                "text": "Hello.",
                "voice": "en-US-AriaNeural",
                "rate": 1.0,
            })

    assert response.status_code == 500
    assert "Speech synthesis failed" in response.json()["detail"]


@pytest.mark.anyio
async def test_tts_azure_unexpected_error():
    with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
        mock_tts.side_effect = RuntimeError("Unexpected Azure SDK error")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={
                "text": "Hello.",
                "voice": "en-US-AriaNeural",
                "rate": 1.0,
            })

    assert response.status_code == 500
    assert "Failed to synthesize speech" in response.json()["detail"]


@pytest.mark.anyio
async def test_pronunciation_azure_assessment_failure():
    with patch("services.azure_speech.azure_speech_service.assess_pronunciation", new_callable=AsyncMock) as mock_assess:
        mock_assess.side_effect = ValueError("Pronunciation assessment failed: Audio too short")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pronunciation",
                files={"audio": ("test.wav", b"short", "audio/wav")},
                data={"referenceText": "hello"},
            )

    assert response.status_code == 500
    assert "Pronunciation assessment failed" in response.json()["detail"]


@pytest.mark.anyio
async def test_pronunciation_azure_unexpected_error():
    with patch("services.azure_speech.azure_speech_service.assess_pronunciation", new_callable=AsyncMock) as mock_assess:
        mock_assess.side_effect = RuntimeError("SDK crash")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pronunciation",
                files={"audio": ("test.wav", b"audio", "audio/wav")},
                data={"referenceText": "hello"},
            )

    assert response.status_code == 500
    assert "Failed to assess pronunciation" in response.json()["detail"]


# ============================================================
# Invalid Input Validation
# ============================================================

@pytest.mark.anyio
async def test_examiner_empty_body():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/examiner", json={})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_feedback_empty_body():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/feedback", json={})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_examiner_message_missing_content():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/examiner", json={
            "mode": "ielts_part_1",
            "messages": [
                {"id": "1", "role": "user", "createdAt": "2024-01-01T00:00:00Z"},
            ],
        })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_examiner_message_invalid_role():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/examiner", json={
            "mode": "ielts_part_1",
            "messages": [
                {"id": "1", "role": "invalid_role", "content": "Hello", "createdAt": "2024-01-01T00:00:00Z"},
            ],
        })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_tts_null_text():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={
            "text": None,
            "voice": "en-US-AriaNeural",
            "rate": 1.0,
        })
    assert response.status_code == 422
