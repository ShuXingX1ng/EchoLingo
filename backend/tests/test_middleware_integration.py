"""
Middleware integration tests - CORS headers, JWT auth on real endpoints.
"""
import json
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


# ============================================================
# CORS Tests
# ============================================================

@pytest.mark.anyio
async def test_cors_allowed_origin():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options("/api/examiner",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


@pytest.mark.anyio
async def test_cors_disallowed_origin():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options("/api/examiner",
            headers={
                "Origin": "https://evil-site.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    allow_origin = response.headers.get("access-control-allow-origin", "")
    assert allow_origin != "https://evil-site.com"


@pytest.mark.anyio
async def test_cors_methods_allowed():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options("/api/examiner",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    allow_methods = response.headers.get("access-control-allow-methods", "")
    assert "POST" in allow_methods


@pytest.mark.anyio
async def test_cors_credentials_allowed():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options("/api/examiner",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.headers.get("access-control-allow-credentials") == "true"


@pytest.mark.anyio
async def test_cors_headers_allowed():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options("/api/examiner",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type, authorization",
            },
        )

    allow_headers = response.headers.get("access-control-allow-headers", "")
    assert "content-type" in allow_headers.lower()


@pytest.mark.anyio
async def test_cors_alt_origin():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options("/api/examiner",
            headers={
                "Origin": "http://localhost:3001",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.headers.get("access-control-allow-origin") == "http://localhost:3001"


# ============================================================
# Auth Middleware on Real Endpoints
# ============================================================

@pytest.mark.anyio
async def test_examiner_no_auth_required():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "What is your name?"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 200


@pytest.mark.anyio
async def test_feedback_no_auth_required():
    mock_feedback = json.dumps({
        "estimatedBand": 6.0,
        "fluencyAndCoherence": "Good",
        "lexicalResource": "Adequate",
        "grammarRangeAndAccuracy": "Fair",
        "pronunciation": "Clear",
        "strengths": ["Good"],
        "weaknesses": ["Limited"],
        "improvementSuggestions": ["Practice more", "Read more", "Speak more"],
        "improvedSampleAnswer": "Sample answer here.",
        "errorAnnotations": [],
    })
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_feedback
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/feedback", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 200


@pytest.mark.anyio
async def test_tts_no_auth_required():
    mock_audio = b"RIFF" + bytes(50)
    with patch("services.azure_speech.azure_speech_service.synthesize_speech", new_callable=AsyncMock) as mock_tts:
        mock_tts.return_value = mock_audio
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/tts", json={
                "text": "Hello",
                "voice": "en-US-AriaNeural",
                "rate": 1.0,
            })

    assert response.status_code == 200


@pytest.mark.anyio
async def test_health_endpoint_accessible():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.anyio
async def test_root_endpoint_accessible():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
    assert response.status_code == 200
    assert response.json()["name"] == "EchoLingo API"
