"""
Authentication Middleware

Provides JWT verification and user extraction for protected endpoints.
"""

from typing import Optional
from fastapi import Depends, HTTPException, Header
from services.supabase import supabase_service


async def get_current_user(
    authorization: Optional[str] = Header(None),
) -> Optional[dict]:
    """
    Extract and verify user from Authorization header.

    This is a dependency that can be used in route handlers.
    Returns None if no token is provided (for optional auth).
    Raises HTTPException if token is invalid.

    Usage:
        @router.get("/protected")
        async def protected_route(user: dict = Depends(get_current_user)):
            return {"user_id": user["id"]}
    """
    if not authorization:
        return None

    # Extract token from "Bearer <token>" format
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format"
        )

    token = authorization[7:]  # Remove "Bearer " prefix

    if not supabase_service.is_configured():
        # If Supabase is not configured, skip auth
        # This allows local development without Supabase
        return None

    user = await supabase_service.verify_token(token)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    return user


async def require_user(
    user: Optional[dict] = Depends(get_current_user),
) -> dict:
    """
    Require authenticated user.

    Raises HTTPException if no user is authenticated.

    Usage:
        @router.post("/protected")
        async def protected_route(user: dict = Depends(require_user)):
            return {"user_id": user["id"]}
    """
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    return user


async def get_optional_user(
    authorization: Optional[str] = Header(None),
) -> Optional[dict]:
    """
    Get user if authenticated, None otherwise.

    Never raises HTTPException - always returns user or None.

    Usage:
        @router.get("/public")
        async def public_route(user: Optional[dict] = Depends(get_optional_user)):
            if user:
                return {"message": f"Hello {user['email']}"}
            return {"message": "Hello anonymous"}
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    if not supabase_service.is_configured():
        return None

    token = authorization[7:]
    return await supabase_service.verify_token(token)
