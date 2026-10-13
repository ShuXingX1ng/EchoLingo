"""
LLM module

Every model call the backend makes goes through here: plain text, JSON, and
bounded tool-calling loops. Uses ChatOpenAI (OpenAI-compatible) so it works
with DeepSeek, OpenAI, or any provider that implements /chat/completions.

`ChatOpenAI` is constructed in exactly one place (`_make_llm`), so a test that
replaces `services.llm_chain.ChatOpenAI` with a scripted model covers every
caller.
"""

import json
import os
import re
from dataclasses import dataclass
from typing import Callable, Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage


def parse_json(raw: Optional[str]) -> Optional[dict]:
    """The JSON object in a model reply, or None.

    Models asked for JSON sometimes wrap it in prose or a code fence, so a
    reply that does not parse as a whole is searched for its outermost object.
    """
    if not raw:
        return None
    embedded = re.search(r"\{[\s\S]*\}", raw)
    for candidate in (raw, embedded.group(0) if embedded else None):
        if candidate is None:
            continue
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


@dataclass
class ToolLoopResult:
    """Outcome of `run_tool_loop`.

    `text` is the model's first reply that asked for no tools, or "" when
    every round was spent on tool calls. `messages` is the conversation so
    far, ready to hand to `ainvoke_messages` for a forced final answer.
    """
    text: str
    messages: list


class LLMChainService:
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
        return await self.ainvoke_messages(
            [SystemMessage(content=system), HumanMessage(content=user)],
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=json_mode,
            timeout=timeout,
        )

    async def ainvoke_messages(
        self,
        messages: list,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        json_mode: bool = False,
        timeout: float = 60.0,
    ) -> str:
        """Like `ainvoke`, for a conversation that is already a message list."""
        self._check_config()
        llm = self._make_llm(temperature, max_tokens, json_mode, timeout)
        response = await llm.ainvoke(messages)
        return response.content or ""

    async def run_tool_loop(
        self,
        messages: list,
        tools: list,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        timeout: float = 60.0,
        max_rounds: int = 4,
        on_tool_result: Optional[Callable[[str, str], None]] = None,
    ) -> ToolLoopResult:
        """
        Let the model call `tools` for at most `max_rounds` rounds.

        Each round the model either answers (the loop ends) or asks for
        tools, whose results are appended to the conversation. A call to a
        tool that was not offered is ignored. `on_tool_result(name, result)`
        is told about every tool result as it arrives.

        Raises:
            ValueError: If LLM_API_KEY is missing.
            Exception:  Any network, API or tool error bubbles up to the caller.
        """
        self._check_config()
        llm = self._make_llm(temperature, max_tokens, False, timeout).bind_tools(tools)
        tool_map = {tool.name: tool for tool in tools}
        messages = list(messages)

        for _ in range(max_rounds):
            response = await llm.ainvoke(messages)
            messages.append(response)
            if not response.tool_calls:
                return ToolLoopResult(text=response.content or "", messages=messages)

            for call in response.tool_calls:
                tool = tool_map.get(call["name"])
                if tool is None:
                    continue
                result = tool.invoke(call["args"])
                messages.append(ToolMessage(content=result, tool_call_id=call["id"]))
                if on_tool_result:
                    on_tool_result(call["name"], result)

        return ToolLoopResult(text="", messages=messages)


# Singleton
llm_chain = LLMChainService()
