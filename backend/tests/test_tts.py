"""
Tests for TTS API.
"""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.mark.anyio
async def test_tts_missing_text():
    """Test TTS endpoint rejects empty text."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "", "voice": "en-US-AriaNeural", "rate": 1.0},
        )
    assert response.status_code == 400  # Manual validation in route handler


@pytest.mark.anyio
async def test_tts_success():
    """Test TTS endpoint returns WAV audio with mocked Azure."""
    mock_audio = b"RIFF" + b"\x00" * 100  # Minimal WAV-like data

    with patch(
        "services.azure_speech.azure_speech_service.synthesize_speech",
        new_callable=AsyncMock,
    ) as mock_tts:
        mock_tts.return_value = mock_audio

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/tts",
                json={
                    "text": "Hello, how are you?",
                    "voice": "en-US-AriaNeural",
                    "rate": 0.95,
                },
            )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == mock_audio


@pytest.mark.anyio
async def test_tts_azure_not_configured():
    """Test TTS endpoint handles unconfigured Azure."""
    with patch(
        "services.azure_speech.azure_speech_service.is_configured",
        return_value=False,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/tts",
                json={
                    "text": "Hello",
                    "voice": "en-US-AriaNeural",
                    "rate": 1.0,
                },
            )

    assert response.status_code == 500
