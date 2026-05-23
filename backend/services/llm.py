"""
LLM Service

Encapsulates DeepSeek/OpenAI compatible API calls.
"""

import os
import json
import httpx
from typing import List, Dict, Any, Optional
from models.schemas import ChatMessage

# Timeouts
EXAMINER_TIMEOUT = 60.0  # 60 seconds
FEEDBACK_TIMEOUT = 120.0  # 120 seconds


class LLMService:
    """Service for calling LLM APIs (DeepSeek/OpenAI compatible)."""

    def __init__(self):
        self.api_key = os.getenv("LLM_API_KEY")
        self.base_url = os.getenv("LLM_BASE_URL", "https://api.deepseek.com")
        self.model = os.getenv("LLM_MODEL", "deepseek-chat")

    def is_configured(self) -> bool:
        """Check if LLM service is properly configured."""
        return bool(self.api_key and self.base_url and self.model)

    def _extract_message(self, data: Dict[str, Any]) -> str:
        """Extract message from various LLM response formats."""
        # OpenAI format
        if data.get("choices") and len(data["choices"]) > 0:
            choice = data["choices"][0].get("message", {})
            content = choice.get("content", "")
            # Handle reasoning models (like DeepSeek)
            if not content and choice.get("reasoning_content"):
                print(f"Warning: Model returned reasoning but no content")
            return content

        # Some providers return content as array
        if data.get("content") and isinstance(data["content"], list):
            return "".join(c.get("text", "") for c in data["content"])

        # Some providers use 'response' field
        if data.get("response"):
            return data["response"]

        # Some providers use 'message' field
        if data.get("message") and isinstance(data["message"], str):
            return data["message"]

        return ""

    async def call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        timeout: float = EXAMINER_TIMEOUT,
        response_format: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Call LLM API and return the response message.

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
            timeout: Request timeout in seconds
            response_format: Optional response format (e.g., {"type": "json_object"})

        Returns:
            The LLM response message as a string

        Raises:
            ValueError: If LLM is not configured or returns empty response
            httpx.HTTPStatusError: If the API returns an error status
        """
        if not self.is_configured():
            raise ValueError(
                "LLM API configuration is missing. "
                "Please set LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL in environment variables."
            )

        request_body = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_format:
            request_body["response_format"] = response_format

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
                json=request_body,
            )

        if not response.status_code == 200:
            error_text = response.text
            print(f"LLM API error ({response.status_code}): {error_text}")

            if response.status_code == 401:
                raise ValueError("Invalid API key. Please check your LLM_API_KEY.")
            if response.status_code == 429:
                raise ValueError("Rate limit exceeded. Please wait a moment and try again.")

            raise ValueError(f"LLM API error ({response.status_code}). Please try again.")

        data = response.json()
        print(f"LLM response: {json.dumps(data)[:500]}")

        message = self._extract_message(data)

        if not message or message.strip() == "":
            print(f"Empty LLM response, full data: {json.dumps(data)}")
            raise ValueError("The AI returned an empty response. Please try again.")

        return message.strip()


# Singleton instance
llm_service = LLMService()
