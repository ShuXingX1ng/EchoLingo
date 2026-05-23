"""
Tests for Authentication Middleware.
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from middleware.auth import get_current_user, require_user, get_optional_user


# Create a test app with protected routes
app = FastAPI()


@app.get("/public")
async def public_route(user=Depends(get_optional_user)):
    if user:
        return {"message": f"Hello {user.get('email', 'user')}", "authenticated": True}
    return {"message": "Hello anonymous", "authenticated": False}


@app.get("/protected")
async def protected_route(user=Depends(require_user)):
    return {"user_id": user["id"], "email": user.get("email")}


@app.get("/optional")
async def optional_route(user=Depends(get_current_user)):
    if user:
        return {"user": user}
    return {"user": None}


client = TestClient(app)


def test_public_route_no_auth():
    """Test public route works without authentication."""
    response = client.get("/public")
    assert response.status_code == 200
    data = response.json()
    assert data["authenticated"] is False
    assert data["message"] == "Hello anonymous"


def test_public_route_with_invalid_token():
    """Test public route works with invalid token (returns anonymous)."""
    with patch("services.supabase.supabase_service.is_configured", return_value=True):
        with patch("services.supabase.supabase_service.verify_token", new_callable=AsyncMock, return_value=None):
            response = client.get(
                "/public",
                headers={"Authorization": "Bearer invalid-token"}
            )
    assert response.status_code == 200
    data = response.json()
    assert data["authenticated"] is False


def test_public_route_with_valid_token():
    """Test public route returns user when authenticated."""
    mock_user = {"id": "user-123", "email": "test@example.com"}
    with patch("services.supabase.supabase_service.is_configured", return_value=True):
        with patch("services.supabase.supabase_service.verify_token", new_callable=AsyncMock, return_value=mock_user):
            response = client.get(
                "/public",
                headers={"Authorization": "Bearer valid-token"}
            )
    assert response.status_code == 200
    data = response.json()
    assert data["authenticated"] is True
    assert "test@example.com" in data["message"]


def test_protected_route_no_auth():
    """Test protected route rejects unauthenticated requests."""
    response = client.get("/protected")
    assert response.status_code == 401


def test_protected_route_invalid_token():
    """Test protected route rejects invalid tokens."""
    with patch("services.supabase.supabase_service.is_configured", return_value=True):
        with patch("services.supabase.supabase_service.verify_token", new_callable=AsyncMock, return_value=None):
            response = client.get(
                "/protected",
                headers={"Authorization": "Bearer invalid-token"}
            )
    assert response.status_code == 401


def test_protected_route_valid_token():
    """Test protected route returns user data when authenticated."""
    mock_user = {"id": "user-123", "email": "test@example.com"}
    with patch("services.supabase.supabase_service.is_configured", return_value=True):
        with patch("services.supabase.supabase_service.verify_token", new_callable=AsyncMock, return_value=mock_user):
            response = client.get(
                "/protected",
                headers={"Authorization": "Bearer valid-token"}
            )
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == "user-123"
    assert data["email"] == "test@example.com"


def test_protected_route_malformed_header():
    """Test protected route rejects malformed authorization header."""
    response = client.get(
        "/protected",
        headers={"Authorization": "InvalidFormat token"}
    )
    assert response.status_code == 401


def test_optional_route_no_auth():
    """Test optional route returns None when not authenticated."""
    response = client.get("/optional")
    assert response.status_code == 200
    data = response.json()
    assert data["user"] is None


def test_optional_route_with_auth():
    """Test optional route returns user when authenticated."""
    mock_user = {"id": "user-123", "email": "test@example.com"}
    with patch("services.supabase.supabase_service.is_configured", return_value=True):
        with patch("services.supabase.supabase_service.verify_token", new_callable=AsyncMock, return_value=mock_user):
            response = client.get(
                "/optional",
                headers={"Authorization": "Bearer valid-token"}
            )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["id"] == "user-123"


def test_auth_skipped_when_supabase_not_configured():
    """Test authentication is skipped when Supabase is not configured."""
    with patch("services.supabase.supabase_service.is_configured", return_value=False):
        response = client.get(
            "/protected",
            headers={"Authorization": "Bearer some-token"}
        )
    # Should pass through without auth when Supabase is not configured
    assert response.status_code == 200
