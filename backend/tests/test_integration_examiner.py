"""
Integration tests for Examiner API - Part 1/2/3 modes, multi-turn, prompt verification.
"""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.mark.anyio
async def test_examiner_part1_multi_turn():
    responses = [
        "That is great! What do you enjoy most about your studies?",
        "Interesting! How often do you read books?",
    ]
    call_count = 0

    async def mock_llm_side_effect(*args, **kwargs):
        nonlocal call_count
        resp = responses[min(call_count, len(responses) - 1)]
        call_count += 1
        return resp

    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock, side_effect=mock_llm_side_effect):
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
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "Describe a memorable trip. You have 1 minute to prepare."
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/examiner", json={
                "mode": "ielts_part_2",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Now we move to Part 2.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    assert response.status_code == 200
    call_args = mock_llm.call_args
    messages = call_args.kwargs.get("messages", call_args[1].get("messages", []))
    system_msg = messages[0]["content"]
    assert "Part 2" in system_msg
    assert "cue card" in system_msg.lower()


@pytest.mark.anyio
async def test_examiner_part3_discussion():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "Do you think technology has made life better?"
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
    call_args = mock_llm.call_args
    messages = call_args.kwargs.get("messages", call_args[1].get("messages", []))
    system_msg = messages[0]["content"]
    assert "Part 3" in system_msg


@pytest.mark.anyio
async def test_examiner_message_role_conversion():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "What is your favorite color?"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "examiner", "content": "Hello!", "createdAt": "2024-01-01T00:00:00Z"},
                    {"id": "2", "role": "user", "content": "Hi there!", "createdAt": "2024-01-01T00:00:01Z"},
                ],
            })

    call_args = mock_llm.call_args
    messages = call_args.kwargs.get("messages", call_args[1].get("messages", []))
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == "Hello!"
    assert messages[2]["role"] == "user"
    assert messages[2]["content"] == "Hi there!"


@pytest.mark.anyio
async def test_examiner_response_schema():
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "What do you do for fun?"
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
    with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "Tell me about your hometown."
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/examiner", json={
                "mode": "ielts_part_1",
                "messages": [
                    {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                ],
            })

    mock_llm.assert_called_once()
    call_kwargs = mock_llm.call_args.kwargs
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
        with patch("services.llm.llm_service.call_llm", new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = "A test response."
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/examiner", json={
                    "mode": mode,
                    "messages": [
                        {"id": "1", "role": "user", "content": "Hello.", "createdAt": "2024-01-01T00:00:00Z"},
                    ],
                })

            assert response.status_code == 200
            call_args = mock_llm.call_args
            messages = call_args.kwargs.get("messages", call_args[1].get("messages", []))
            system_prompts.append(messages[0]["content"])

    assert system_prompts[0] != system_prompts[1]
    assert system_prompts[1] != system_prompts[2]
    assert "Part 1" in system_prompts[0]
    assert "Part 2" in system_prompts[1]
    assert "Part 3" in system_prompts[2]
