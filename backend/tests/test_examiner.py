"""
Tests for Examiner API.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


def _make_examiner_mock(return_value: str):
    """Return a (MockChatOpenAI context, mock_chain) pair for the examiner router."""
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=return_value)
    mock_llm = MagicMock()
    mock_llm.__or__ = MagicMock(return_value=mock_chain)
    return mock_llm, mock_chain


@pytest.mark.anyio
async def test_examiner_missing_messages():
    """Test examiner endpoint rejects empty messages."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/examiner",
            json={"mode": "ielts_part_1", "messages": []},
        )
    assert response.status_code == 400


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
    assert response.status_code == 422


@pytest.mark.anyio
async def test_examiner_success():
    """Test examiner endpoint returns valid response with mocked LLM."""
    mock_response = "That's interesting. What do you like most about your hometown?"
    mock_llm, _ = _make_examiner_mock(mock_response)

    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
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
    """Test examiner endpoint handles unconfigured LLM (ValueError → 502)."""
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(side_effect=ValueError("LLM_API_KEY is not set."))
    mock_llm = MagicMock()
    mock_llm.__or__ = MagicMock(return_value=mock_chain)

    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
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
