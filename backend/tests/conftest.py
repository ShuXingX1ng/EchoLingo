"""
Pytest configuration for EchoLingo backend tests.
"""

import httpx
import pytest
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture(autouse=True)
def no_live_http(monkeypatch):
    """Fail any test that reaches a real HTTP endpoint.

    Importing `main` loads `backend/.env`, so real provider keys are present
    while tests run. A call that slips past its mock would otherwise go out to
    a paid service, and callers that swallow provider errors would hide it.
    The in-process test client uses `ASGITransport` and is unaffected.
    """
    attempted: list[str] = []

    def refuse(self, request):
        attempted.append(f"{request.method} {request.url}")
        raise RuntimeError(f"live HTTP call in a test: {request.method} {request.url}")

    async def refuse_async(self, request):
        refuse(self, request)

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse_async)
    yield
    assert not attempted, f"test made live HTTP calls: {attempted}"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Create async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
