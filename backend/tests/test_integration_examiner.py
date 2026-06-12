"""
Integration tests for Examiner API - Part 1/2/3 modes, multi-turn, prompt verification.

The examiner router creates a ChatOpenAI instance directly, so tests patch
routers.examiner.ChatOpenAI and use the __or__ trick to capture messages.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from langchain_core.messages import SystemMessage, AIMessage, HumanMessage
from main import app


def _examiner_mock(return_value=None, side_effect=None):
    """Build a (mock_llm, mock_chain, captured) triple."""
    captured = {}

    async def _ainvoke(messages):
        captured["messages"] = list(messages)
        return return_value

    mock_chain = MagicMock()
    if side_effect is not None:
        mock_chain.ainvoke = AsyncMock(side_effect=side_effect)
    else:
        mock_chain.ainvoke = AsyncMock(side_effect=_ainvoke)

    mock_llm = MagicMock()
    mock_llm.__or__ = MagicMock(return_value=mock_chain)
    return mock_llm, mock_chain, captured


@pytest.mark.anyio
async def test_examiner_part1_multi_turn():
    responses = [
        "That is great! What do you enjoy most about your studies?",
        "Interesting! How often do you read books?",
    ]
    call_count = 0

    async def multi_turn_side_effect(messages):
        nonlocal call_count
        resp = responses[min(call_count, len(responses) - 1)]
        call_count += 1
        return resp

    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(side_effect=multi_turn_side_effect)
    mock_llm = MagicMock()
    mock_llm.__or__ = MagicMock(return_value=mock_chain)

    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp1 = await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Tell me about your studies.", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "I study computer science.", "createdAt": "2024-01-01T00:00:01Z"},
                ],
            })
            assert resp1.status_code == 200
            assert resp1.json()["message"] == responses[0]

            resp2 = await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Tell me about your studies.", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "I study computer science.", "createdAt": "2024-01-01T00:00:01Z"},
                    {"id": "3", "role": "examiner", "content": responses[0], "createdAt": "2024-01-01T00:00:02Z"},
                    {"id": "4", "role": "user", "content": "I enjoy programming the most.", "createdAt": "2024-01-01T00:00:03Z"},
                ],
            })
            assert resp2.status_code == 200
            assert resp2.json()["message"] == responses[1]

    assert call_count == 2


@pytest.mark.anyio
async def test_examiner_part2_cue_card():
    mock_llm, _, captured = _examiner_mock("Describe a memorable trip. You have 1 minute to prepare.")
    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/examiner", json={
                "mode": "ielts_part_2",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Now we move to Part 2.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 200
    system_msg = captured["messages"][0]
    assert isinstance(system_msg, SystemMessage)
    assert "Part 2" in system_msg.content
    assert "cue card" in system_msg.content.lower()


@pytest.mark.anyio
async def test_examiner_part3_discussion():
    mock_llm, _, captured = _examiner_mock("Do you think technology has made life better?")
    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/examiner", json={
                "mode": "ielts_part_3",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Let us discuss technology.", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "Technology has made life easier.", "createdAt": "2024-01-01T00:00:01Z"},
                ],
            })

    assert response.status_code == 200
    system_msg = captured["messages"][0]
    assert isinstance(system_msg, SystemMessage)
    assert "Part 3" in system_msg.content


@pytest.mark.anyio
async def test_examiner_message_role_conversion():
    mock_llm, _, captured = _examiner_mock("What is your favorite color?")
    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Hello!", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "Hi there!", "createdAt": "2024-01-01T00:00:01Z"},
                ],
            })

    # messages[0] is SystemMessage; [1] is AIMessage (examiner→assistant); [2] is HumanMessage
    assert isinstance(captured["messages"][1], AIMessage)
    assert captured["messages"][1].content == "Hello!"
    assert isinstance(captured["messages"][2], HumanMessage)
    assert captured["messages"][2].content == "Hi there!"


@pytest.mark.anyio
async def test_examiner_response_schema():
    mock_llm, _, _ = _examiner_mock("What do you do for fun?")
    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "I like playing games.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert isinstance(data["message"], str)
    assert len(data["message"]) > 0


@pytest.mark.anyio
async def test_examiner_llm_parameters():
    mock_llm, _, _ = _examiner_mock("Tell me about your hometown.")
    with patch("langchain_openai.ChatOpenAI", return_value=mock_llm) as MockChatOpenAI:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    MockChatOpenAI.assert_called_once()
    call_kwargs = MockChatOpenAI.call_args.kwargs
    assert call_kwargs["temperature"] == 0.7
    assert call_kwargs["max_tokens"] == 1000


@pytest.mark.anyio
async def test_examiner_missing_messages_field():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/examiner", json={"mode": "ielts_part_1"})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_examiner_all_three_modes_different_prompts():
    modes = ["ielts_part_1", "ielts_part_2", "ielts_part_3"]
    system_prompts = []

    for mode in modes:
        mock_llm, _, captured = _examiner_mock("A test response.")
        with patch("langchain_openai.ChatOpenAI", return_value=mock_llm):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/examiner", json={
                    "mode": mode,
                    "messages": [
                        {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                    ],
                })

        assert response.status_code == 200
        system_prompts.append(captured["messages"][0].content)

    assert system_prompts[0] != system_prompts[1]
    assert system_prompts[1] != system_prompts[2]
    assert "Part 1" in system_prompts[0]
    assert "Part 2" in system_prompts[1]
    assert "Part 3" in system_prompts[2]
