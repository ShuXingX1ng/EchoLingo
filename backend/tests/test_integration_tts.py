"""
Integration tests for TTS API - audio synthesis, voice options, response headers.
"""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


# Use a helper to create mock audio bytes without literal null bytes in source
def _make_mock_audio(size=100):
    return b"RIFF" + bytes(size)


@pytest.mark.anyio
async def test_tts_returns_wav_audio():
    mock_audio = _make_mock_audio(100)
    with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
        mock_tts.return_value = mock_audio
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={
                "text": "Hello, how are you today?",
                "voice": "en-US-AriaNeural",
                "rate": 0.95,
            })

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == mock_audio


@pytest.mark.anyio
async def test_tts_cache_control_header():
    mock_audio = _make_mock_audio(50)
    with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
        mock_tts.return_value = mock_audio
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={
                "text": "Test.",
                "voice": "en-US-AriaNeural",
                "rate": 1.0,
            })

    assert response.status_code == 200
    assert "Cache-Control" in response.headers
    assert "max-age=86400" in response.headers["Cache-Control"]


@pytest.mark.anyio
async def test_tts_different_voices():
    mock_audio = _make_mock_audio(50)
    voices = ["en-US-AriaNeural", "en-US-GuyNeural", "en-GB-SoniaNeural"]

    for voice in voices:
        with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
            mock_tts.return_value = mock_audio
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/tts", json={
                    "text": "Hello.",
                    "voice": voice,
                    "rate": 1.0,
                })

        assert response.status_code == 200
        call_kwargs = mock_tts.call_args.kwargs
        assert call_kwargs["voice"] == voice


@pytest.mark.anyio
async def test_tts_different_rates():
    mock_audio = _make_mock_audio(50)
    rates = [0.5, 0.95, 1.0, 1.5, 2.0]

    for rate in rates:
        with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
            mock_tts.return_value = mock_audio
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/tts", json={
                    "text": "Hello.",
                    "voice": "en-US-AriaNeural",
                    "rate": rate,
                })

        assert response.status_code == 200
        call_kwargs = mock_tts.call_args.kwargs
        assert call_kwargs["rate"] == rate


@pytest.mark.anyio
async def test_tts_synthesize_called_with_correct_params():
    mock_audio = _make_mock_audio(50)
    with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
        mock_tts.return_value = mock_audio
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/tts", json={
                "text": "This is a test sentence.",
                "voice": "en-GB-SoniaNeural",
                "rate": 0.8,
            })

    mock_tts.assert_called_once()
    call_kwargs = mock_tts.call_args.kwargs
    assert call_kwargs["text"] == "This is a test sentence."
    assert call_kwargs["voice"] == "en-GB-SoniaNeural"
    assert call_kwargs["rate"] == 0.8


@pytest.mark.anyio
async def test_tts_rate_out_of_range():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={
            "text": "Hello.",
            "voice": "en-US-AriaNeural",
            "rate": 3.0,
        })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_tts_rate_below_minimum():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={
            "text": "Hello.",
            "voice": "en-US-AriaNeural",
            "rate": 0.1,
        })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_tts_missing_text_field():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tts", json={
            "voice": "en-US-AriaNeural",
            "rate": 1.0,
        })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_tts_default_voice_and_rate():
    mock_audio = _make_mock_audio(50)
    with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
        mock_tts.return_value = mock_audio
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={
                "text": "Hello.",
            })

    assert response.status_code == 200
    call_kwargs = mock_tts.call_args.kwargs
    assert call_kwargs["voice"] == "en-US-AriaNeural"
    assert call_kwargs["rate"] == 0.95
