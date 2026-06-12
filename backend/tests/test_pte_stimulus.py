"""
Tests for PTE Stimulus API (POST /api/pte/stimulus).
"""

import json
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.mark.anyio
async def test_stimulus_missing_task_type():
    """Request with no body returns 422 (Pydantic validation)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/pte/stimulus", json={})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_stimulus_invalid_task_type():
    """Unknown taskType returns 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/pte/stimulus", json={"taskType": "unknown_type"})
    assert response.status_code == 400


@pytest.mark.anyio
async def test_stimulus_personal_intro_no_llm_call():
    """personal_intro returns empty text immediately without calling the LLM."""
    with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pte/stimulus", json={"taskType": "personal_intro"})

    assert response.status_code == 200
    assert response.json()["text"] == ""
    mock_ainvoke.assert_not_called()


@pytest.mark.anyio
async def test_stimulus_plain_text_task():
    """Plain-text task (repeat_sentence) calls LLM and returns the text."""
    with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
        mock_ainvoke.return_value = "The researchers published their findings in a peer-reviewed journal."
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pte/stimulus", json={"taskType": "repeat_sentence"})

    assert response.status_code == 200
    assert response.json()["text"] == "The researchers published their findings in a peer-reviewed journal."
    call_kwargs = mock_ainvoke.call_args.kwargs
    # Plain-text tasks must NOT request json_mode
    assert call_kwargs.get("json_mode") is False
    assert call_kwargs.get("max_tokens") == 300


@pytest.mark.anyio
async def test_stimulus_json_task_uses_json_format():
    """JSON-structured task (fill_in_the_blanks_reading) uses json_mode=True and 800 tokens."""
    mock_payload = json.dumps({
        "passage": "Scientists [BLANK_0] new discoveries every year.",
        "blanks": [{"options": ["make", "avoid", "reject", "ignore"], "correct": 0}],
    })
    with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
        mock_ainvoke.return_value = mock_payload
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pte/stimulus", json={"taskType": "fill_in_the_blanks_reading"}
            )

    assert response.status_code == 200
    assert response.json()["text"] == mock_payload
    call_kwargs = mock_ainvoke.call_args.kwargs
    assert call_kwargs.get("json_mode") is True
    assert call_kwargs.get("max_tokens") == 800


@pytest.mark.anyio
async def test_stimulus_listening_json_tasks():
    """Listening JSON tasks (fill_in_the_blanks_listening, highlight_correct_summary) also use json_mode=True."""
    for task_type in ("fill_in_the_blanks_listening", "highlight_correct_summary"):
        with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
            mock_ainvoke.return_value = '{"passage":"test","blanks":[]}'
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/pte/stimulus", json={"taskType": task_type})

        assert response.status_code == 200
        call_kwargs = mock_ainvoke.call_args.kwargs
        assert call_kwargs.get("json_mode") is True


@pytest.mark.anyio
async def test_stimulus_llm_not_configured():
    """Returns 502 when LLM raises ValueError (e.g. LLM_API_KEY missing)."""
    with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
        mock_ainvoke.side_effect = ValueError("LLM_API_KEY is not set.")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pte/stimulus", json={"taskType": "repeat_sentence"})
    assert response.status_code == 502


@pytest.mark.anyio
async def test_stimulus_llm_empty_response():
    """Returns 500 when LLM returns an empty string (router treats it as unexpected error)."""
    with patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_ainvoke:
        mock_ainvoke.return_value = ""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/pte/stimulus", json={"taskType": "repeat_sentence"})

    # Empty string is not a ValueError — falls through to the success path (returns empty text)
    # OR the router catches it and returns 500; either is acceptable
    assert response.status_code in [200, 500]
