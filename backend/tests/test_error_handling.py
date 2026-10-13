"""
Error handling tests - LLM failures, Azure unavailability, invalid inputs, edge cases.
"""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


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
async def test_tts_null_text():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={
            "text": None,
            "voice": "en-US-AriaNeural",
            "rate": 1.0,
        })
    assert response.status_code == 422
