"""
Tests for health check and root endpoints.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.mark.anyio
async def test_health_check():
    """Test health check endpoint returns 200."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "echolingo-api"


@pytest.mark.anyio
async def test_root():
    """Test root endpoint returns API info."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "EchoLingo API"
    assert data["version"] == "1.0.0"
    assert data["docs"] == "/docs"


@pytest.mark.anyio
async def test_examiner_not_implemented():
    """Test examiner endpoint returns 501 (not yet implemented)."""
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
                    }
                ],
            },
        )
    assert response.status_code == 501
