"""
Tests for Examiner API.
"""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.mark.anyio
async def test_examiner_missing_messages():
    """Test examiner endpoint rejects empty messages."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/examiner",
            json={"mode": "ielts_part_1", "messages": []},
        )
    assert response.status_code == 422  # Pydantic validation error


@pytest.mark.anyio
async def test_examiner_invalid_mode():
    """Test examiner endpoint rejects invalid mode."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/examiner",
            json={
                "mode": "invalid_mode",
                "messages": [
                    {
                        "id": "1",
                        "role": "examiner",
                        "content": "Hello",
                        "createdAt": "2024-01-01T00:00:00Z",
                    }
                ],
            },
        )
    assert response.status_code == 422  # Pydantic validation error


@pytest.mark.anyio
async def test_examiner_success():
    """Test examiner endpoint returns valid response with mocked LLM."""
    mock_response = "That's interesting. What do you like most about your hometown?"

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/examiner",
                json={
                    "mode": "ielts_part_1",
                    "messages": [
                        {
                            "id": "1",
                            "role": "examiner",
                            "content": "Hello, how are you?",
                            "createdAt": "2024-01-01T00:00:00Z",
                        },
                        {
                            "id": "2",
                            "role": "user",
                            "content": "I'm fine, thank you.",
                            "createdAt": "2024-01-01T00:00:01Z",
                        },
                    ],
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert data["message"] == mock_response


@pytest.mark.anyio
async def test_examiner_llm_not_configured():
    """Test examiner endpoint handles unconfigured LLM."""
    with patch("services.llm.llm_service.is_configured", return_value=False):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/examiner",
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
