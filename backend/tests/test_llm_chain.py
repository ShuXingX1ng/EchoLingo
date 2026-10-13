"""Tests for the LLM module, driven through a scripted model (no network)."""

import pytest
from unittest.mock import patch
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import tool

from services.llm_chain import llm_chain, parse_json
from tests.scripted_llm import ScriptedChatModel, tool_call


@tool
def lookup(word: str) -> str:
    """Look a word up."""
    return f"definition of {word}"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-key")


def test_parse_json_reads_plain_and_wrapped_objects():
    assert parse_json('{"a": 1}') == {"a": 1}
    assert parse_json('Here you go:\n```json\n{"a": 1}\n```') == {"a": 1}


def test_parse_json_returns_none_for_anything_that_is_not_an_object():
    assert parse_json("not json at all") is None
    assert parse_json("[1, 2]") is None
    assert parse_json("") is None
    assert parse_json(None) is None


@pytest.mark.anyio
async def test_ainvoke_returns_the_reply_text_and_requests_json_mode():
    model = ScriptedChatModel('{"ok": true}')
    with patch("services.llm_chain.ChatOpenAI", model):
        reply = await llm_chain.ainvoke(system="s", user="u", json_mode=True, max_tokens=50)

    assert reply == '{"ok": true}'
    assert model.constructed[0]["model_kwargs"] == {"response_format": {"type": "json_object"}}
    assert [m.content for m in model.conversations[0]] == ["s", "u"]


@pytest.mark.anyio
async def test_missing_api_key_is_a_value_error_before_any_call(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY")
    model = ScriptedChatModel("unused")
    with patch("services.llm_chain.ChatOpenAI", model):
        with pytest.raises(ValueError, match="LLM_API_KEY"):
            await llm_chain.ainvoke(system="s", user="u")
        with pytest.raises(ValueError, match="LLM_API_KEY"):
            await llm_chain.run_tool_loop([HumanMessage(content="hi")], [lookup])
    assert model.constructed == []


@pytest.mark.anyio
async def test_tool_loop_feeds_tool_results_back_until_the_model_answers():
    model = ScriptedChatModel(tool_call("lookup", {"word": "ubiquitous"}), "It means everywhere.")
    seen = []
    with patch("services.llm_chain.ChatOpenAI", model):
        result = await llm_chain.run_tool_loop(
            [HumanMessage(content="define ubiquitous")],
            [lookup],
            on_tool_result=lambda name, output: seen.append((name, output)),
        )

    assert result.text == "It means everywhere."
    assert seen == [("lookup", "definition of ubiquitous")]
    assert model.bound_tools == [lookup]
    tool_messages = [m for m in model.conversations[1] if isinstance(m, ToolMessage)]
    assert [m.content for m in tool_messages] == ["definition of ubiquitous"]


@pytest.mark.anyio
async def test_tool_loop_stops_after_max_rounds_without_an_answer():
    model = ScriptedChatModel(*[tool_call("lookup", {"word": "a"}, f"call-{i}") for i in range(5)])
    with patch("services.llm_chain.ChatOpenAI", model):
        result = await llm_chain.run_tool_loop(
            [HumanMessage(content="loop")], [lookup], max_rounds=2,
        )

    assert result.text == ""
    assert len(model.conversations) == 2
    # The conversation is returned so the caller can force a final answer.
    assert len(result.messages) == 5


@pytest.mark.anyio
async def test_tool_loop_ignores_a_tool_that_was_not_offered():
    model = ScriptedChatModel(tool_call("delete_everything", {}), "done")
    with patch("services.llm_chain.ChatOpenAI", model):
        result = await llm_chain.run_tool_loop([HumanMessage(content="hi")], [lookup])

    assert result.text == "done"
    assert not any(isinstance(m, ToolMessage) for m in result.messages)
