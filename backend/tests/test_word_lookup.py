"""
Tests for Word Lookup API (POST /api/word-lookup).

Covers the routing decision from ADR 0006:
    single English word  -> ECDICT (hit) ; miss -> DeepSeek
    phrase / sentence    -> DeepSeek
plus input cleaning, validation, and the unified response schema.

ECDICT is mocked so these run without the (gitignored) dictionary file.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from main import app

from services.ecdict import _parse_entries, _parse_tags


async def _post(payload: dict):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/word-lookup", json=payload)


# ── Validation ────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_missing_query_returns_422():
    assert (await _post({})).status_code == 422


@pytest.mark.anyio
async def test_blank_query_returns_400():
    assert (await _post({"query": "   ...  "})).status_code == 400


@pytest.mark.anyio
async def test_overlong_query_returns_400():
    assert (await _post({"query": "x " * 200})).status_code == 400


# ── Single word → ECDICT hit (no LLM call) ────────────────────────────────────

@pytest.mark.anyio
async def test_single_word_dictionary_hit_skips_llm():
    dict_result = {
        "source": "dictionary",
        "text": "bank",
        "phonetic": "bæŋk",
        "entries": [{"pos": "n.", "meaning": "银行, 堤, 岸"}],
        "tags": ["中考", "高考", "雅思"],
    }
    with patch("routers.word_lookup.ecdict_lookup", return_value=dict_result) as mock_dict, \
         patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_llm:
        response = await _post({"query": "  bank.  "})

    assert response.status_code == 200
    assert response.json() == dict_result
    mock_dict.assert_called_once_with("bank")  # cleaned input
    mock_llm.assert_not_called()


# ── Single word → ECDICT miss → DeepSeek fallback ─────────────────────────────

@pytest.mark.anyio
async def test_single_word_dictionary_miss_falls_back_to_llm():
    llm_payload = json.dumps({
        "source": "ai",
        "text": "serendipitously",
        "phonetic": "",
        "entries": [{"pos": "adv.", "meaning": "意外地"}],
        "tags": [],
    })
    with patch("routers.word_lookup.ecdict_lookup", return_value=None), \
         patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = llm_payload
        response = await _post({"query": "serendipitously"})

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "ai"
    assert body["entries"][0]["meaning"] == "意外地"
    assert mock_llm.call_args.kwargs.get("json_mode") is True


# ── Phrase → DeepSeek (ECDICT never consulted) ────────────────────────────────

@pytest.mark.anyio
async def test_phrase_goes_straight_to_llm():
    llm_payload = json.dumps({
        "source": "ai",
        "text": "break the ice",
        "phonetic": "",
        "entries": [{"pos": "phrase", "meaning": "打破僵局"}],
        "tags": [],
    })
    with patch("routers.word_lookup.ecdict_lookup") as mock_dict, \
         patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = llm_payload
        response = await _post({"query": "break the ice"})

    assert response.status_code == 200
    assert response.json()["entries"][0]["meaning"] == "打破僵局"
    mock_dict.assert_not_called()


@pytest.mark.anyio
async def test_llm_response_is_normalised_to_schema():
    """Even a sloppy LLM payload is coerced into the unified schema."""
    with patch("routers.word_lookup.ecdict_lookup", return_value=None), \
         patch("services.llm_chain.llm_chain.ainvoke", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "noise {\"meaning\": \"测试\"} trailing"
        response = await _post({"query": "flibbertigibbet"})

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "ai"
    assert body["text"] == "flibbertigibbet"
    assert body["entries"] == [{"pos": "", "meaning": "测试"}]
    assert body["tags"] == []


# ── ECDICT parsing units (pure, no DB) ────────────────────────────────────────

def test_parse_entries_splits_pos_markers():
    entries = _parse_entries("n. 银行, 堤, 岸\n[医] 库")
    assert entries == [
        {"pos": "n.", "meaning": "银行, 堤, 岸"},
        {"pos": "[医]", "meaning": "库"},
    ]


def test_parse_entries_keeps_unmarked_lines():
    entries = _parse_entries("run的过去式和过去分词")
    assert entries == [{"pos": "", "meaning": "run的过去式和过去分词"}]


def test_parse_tags_maps_known_codes_only():
    assert _parse_tags("zk gk ielts xyz") == ["中考", "高考", "雅思"]
