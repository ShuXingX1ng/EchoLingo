"""
Tests for Pronunciation API.
"""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app
from models.schemas import PronunciationAssessmentResult, WordAssessment


MOCK_PRONUNCIATION_RESULT = PronunciationAssessmentResult(
    score=85,
    accuracyScore=82,
    fluencyScore=88,
    completenessScore=91,
    words=[
        WordAssessment(
            word="hello",
            score=90,
            accuracyScore=88,
            errorType="None",
        ),
        WordAssessment(
            word="world",
            score=85,
            accuracyScore=82,
            errorType="None",
        ),
    ],
    summary="Good pronunciation with minor areas for improvement.",
)


@pytest.mark.anyio
async def test_pronunciation_missing_audio():
    """Test pronunciation endpoint rejects missing audio."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/pronunciation",
            data={"referenceText": "hello world"},
        )
    # Missing required file field
    assert response.status_code == 422


@pytest.mark.anyio
async def test_pronunciation_missing_text():
    """Test pronunciation endpoint rejects missing reference text."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/pronunciation",
            files={"audio": ("test.wav", b"fake audio data", "audio/wav")},
        )
    # Missing required form field
    assert response.status_code == 422


@pytest.mark.anyio
async def test_pronunciation_success():
    """Test pronunciation endpoint returns valid assessment with mocked Azure."""
    with patch(
        "services.azure_speech.azure_speech_service.assess_pronunciation",
        new_callable=AsyncMock,
    ) as mock_assess:
        mock_assess.return_value = MOCK_PRONUNCIATION_RESULT

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pronunciation",
                files={"audio": ("test.wav", b"fake audio data", "audio/wav")},
                data={"referenceText": "hello world"},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["score"] == 85
    assert data["accuracyScore"] == 82
    assert data["fluencyScore"] == 88
    assert data["completenessScore"] == 91
    assert len(data["words"]) == 2
    assert data["words"][0]["word"] == "hello"
    assert "summary" in data


@pytest.mark.anyio
async def test_pronunciation_azure_not_configured():
    """Test pronunciation endpoint handles unconfigured Azure."""
    with patch(
        "services.azure_speech.azure_speech_service.is_configured",
        return_value=False,
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pronunciation",
                files={"audio": ("test.wav", b"fake audio data", "audio/wav")},
                data={"referenceText": "hello world"},
            )

    assert response.status_code == 500
