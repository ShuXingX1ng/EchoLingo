"""
Supabase Service

Encapsulates Supabase Python Client for authentication and database operations.
"""

import os
from typing import Optional, Dict, Any
from supabase import create_client, Client


class SupabaseService:
    """Service for Supabase operations."""

    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.anon_key = os.getenv("SUPABASE_ANON_KEY")
        self.service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self._client: Optional[Client] = None
        self._admin_client: Optional[Client] = None

    @property
    def client(self) -> Client:
        """Get Supabase client (anon key)."""
        if not self._client:
            if not self.url or not self.anon_key:
                raise ValueError("Supabase URL and anon key are required")
            self._client = create_client(self.url, self.anon_key)
        return self._client

    @property
    def admin_client(self) -> Client:
        """Get Supabase admin client (service role key)."""
        if not self._admin_client:
            if not self.url or not self.service_role_key:
                raise ValueError("Supabase URL and service role key are required")
            self._admin_client = create_client(self.url, self.service_role_key)
        return self._admin_client

    def is_configured(self) -> bool:
        """Check if Supabase is properly configured."""
        return bool(self.url and self.anon_key)

    def is_admin_configured(self) -> bool:
        """Check if Supabase admin is properly configured."""
        return bool(self.url and self.service_role_key)

    async def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify a JWT token and return user data.

        Args:
            token: JWT token from Authorization header

        Returns:
            User data dict if valid, None if invalid
        """
        try:
            # Use the auth client to verify the token
            user = self.client.auth.get_user(token)
            if user and user.user:
                return {
                    "id": user.user.id,
                    "email": user.user.email,
                    "role": user.user.role,
                }
            return None
        except Exception as e:
            print(f"Token verification failed: {e}")
            return None

    async def get_user_sessions(
        self, user_id: str, limit: int = 50
    ) -> list:
        """
        Get user's practice sessions from Supabase.

        Args:
            user_id: User ID
            limit: Maximum number of sessions to return

        Returns:
            List of session records
        """
        try:
            response = (
                self.client.table("practice_sessions")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return response.data if response.data else []
        except Exception as e:
            print(f"Failed to get user sessions: {e}")
            return []

    async def save_session(
        self,
        user_id: str,
        session_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Save a practice session to Supabase.

        Args:
            user_id: User ID
            session_data: Session data to save

        Returns:
            Saved record or None on failure
        """
        try:
            record = {
                "user_id": user_id,
                **session_data,
            }
            response = (
                self.client.table("practice_sessions")
                .insert(record)
                .execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Failed to save session: {e}")
            return None

    async def get_user_progress(
        self, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get user's learning progress from Supabase.

        Args:
            user_id: User ID

        Returns:
            Progress data or None
        """
        try:
            response = (
                self.client.table("user_progress")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Failed to get user progress: {e}")
            return None


# Singleton instance
supabase_service = SupabaseService()
