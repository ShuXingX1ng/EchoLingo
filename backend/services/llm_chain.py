"""
LLM Chain Service

LangChain-based LLM client. Replaces the raw httpx calls in services/llm.py.
Uses ChatOpenAI (OpenAI-compatible) so it works with DeepSeek, OpenAI, or any
provider that implements the /chat/completions API.
"""

import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser


class LLMChainService:
    """Thin LangChain wrapper. One method — ainvoke — covers all call sites."""

    def _make_llm(
        self,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
        timeout: float,
    ) -> ChatOpenAI:
        kwargs: dict = {
            "model": os.getenv("LLM_MODEL", "deepseek-chat"),
            "api_key": os.getenv("LLM_API_KEY"),
            "base_url": os.getenv("LLM_BASE_URL", "https://api.deepseek.com"),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "timeout": timeout,
        }
        if json_mode:
            kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatOpenAI(**kwargs)

    def _check_config(self) -> None:
        if not os.getenv("LLM_API_KEY"):
            raise ValueError(
                "LLM_API_KEY is not set. Please add it to your .env file."
            )

    async def ainvoke(
        self,
        system: str,
        user: str,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        json_mode: bool = False,
        timeout: float = 60.0,
    ) -> str:
        """
        Call the LLM with a system + user message pair.

        Args:
            system:      System prompt (plain string, loaded from YAML).
            user:        User message content (dynamic, built by the router).
            temperature: Sampling temperature.
            max_tokens:  Maximum tokens in the response.
            json_mode:   If True, requests JSON-only output via response_format.
            timeout:     Request timeout in seconds.

        Returns:
            The LLM's response as a plain string.

        Raises:
            ValueError: If LLM_API_KEY is missing.
            Exception:  Any network or API error bubbles up to the caller.
        """
        self._check_config()
        llm = self._make_llm(temperature, max_tokens, json_mode, timeout)
        chain = llm | StrOutputParser()
        messages = [SystemMessage(content=system), HumanMessage(content=user)]
        return await chain.ainvoke(messages)


# Singleton
llm_chain = LLMChainService()
