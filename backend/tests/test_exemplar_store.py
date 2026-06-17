"""
Unit tests for services/exemplar_store.py.

Covers random / targeted / theme retrieval, the RRF hybrid SQL, get_verbatim,
and silent failure → []. All embedding and DB access is mocked — no DashScope,
no Supabase, no psycopg2 connection is opened.
"""

import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import services.exemplar_store as store
from services.exemplar_store import Exemplar, get_verbatim, retrieve


def _row(id_: str, text: str, task_type: str = "read_aloud", **extra) -> dict:
    row = {
        "id": id_,
        "task_type": task_type,
        "text": text,
        "difficulty": extra.get("difficulty"),
        "features": extra.get("features", {}),
        "source_url": extra.get("source_url"),
        "license": extra.get("license"),
    }
    return row


# ── from_row mapping ──────────────────────────────────────────────────────────

class TestFromRow:
    def test_maps_all_fields(self):
        ex = Exemplar.from_row(
            _row("a", "hello", difficulty="high", features={"genre": "science"},
                 source_url="http://x", license="CC")
        )
        assert ex.id == "a"
        assert ex.text == "hello"
        assert ex.difficulty == "high"
        assert ex.features == {"genre": "science"}
        assert ex.source_url == "http://x"
        assert ex.license == "CC"

    def test_null_features_becomes_empty_dict(self):
        ex = Exemplar.from_row({"id": "a", "task_type": "read_aloud", "text": "t", "features": None})
        assert ex.features == {}


# ── random mode ─────────────────────────────────────────────────────────────────

class TestRandom:
    @pytest.mark.anyio
    async def test_random_query_and_mapping(self):
        rows = [_row("1", "First."), _row("2", "Second.")]
        with patch.object(store, "_query_db", MagicMock(return_value=rows)) as mock_q:
            result = await retrieve("read_aloud", mode="random", n=2)

        assert [e.text for e in result] == ["First.", "Second."]
        sql, params = mock_q.call_args.args
        assert "ORDER BY random()" in sql
        assert params == {"task_type": "read_aloud", "status": "approved", "n": 2}

    @pytest.mark.anyio
    async def test_unknown_mode_falls_back_to_random(self):
        with patch.object(store, "_query_db", MagicMock(return_value=[])) as mock_q:
            await retrieve("read_aloud", mode="something_else")
        sql, _ = mock_q.call_args.args
        assert "ORDER BY random()" in sql


# ── targeted mode ─────────────────────────────────────────────────────────────

class TestTargeted:
    @pytest.mark.anyio
    async def test_no_targeting_filters_only_task_type(self):
        with patch.object(store, "_query_db", MagicMock(return_value=[])) as mock_q:
            await retrieve("write_essay", mode="targeted", targeting=None)
        sql, params = mock_q.call_args.args
        assert "difficulty = %(difficulty)s" not in sql
        assert "features @>" not in sql
        assert params["task_type"] == "write_essay"
        assert params["status"] == "approved"

    @pytest.mark.anyio
    async def test_difficulty_and_features_filters(self):
        targeting = {"difficulty": "high", "features": {"genre": "science"}}
        with patch.object(store, "_query_db", MagicMock(return_value=[])) as mock_q:
            await retrieve("write_essay", mode="targeted", targeting=targeting, n=4)
        sql, params = mock_q.call_args.args
        assert "difficulty = %(difficulty)s" in sql
        assert "features @> %(features)s::jsonb" in sql
        assert params["difficulty"] == "high"
        assert json.loads(params["features"]) == {"genre": "science"}
        assert params["n"] == 4


# ── theme mode (hybrid RRF) ─────────────────────────────────────────────────────

class TestTheme:
    @pytest.mark.anyio
    async def test_theme_builds_rrf_hybrid_sql(self):
        rows = [_row("a", "Top result."), _row("b", "Second result.")]
        embed = AsyncMock(return_value=[0.1, 0.2, 0.3])
        with (
            patch.object(store, "aembed_query", embed),
            patch.object(store, "_query_db", MagicMock(return_value=rows)) as mock_q,
        ):
            result = await retrieve("read_aloud", mode="theme", topic="environment", n=2)

        embed.assert_awaited_once_with("environment")
        # Mapping preserves the DB's RRF ordering.
        assert [e.text for e in result] == ["Top result.", "Second result."]

        sql, params = mock_q.call_args.args
        # Both retrievers present and fused with the RRF formula in one statement.
        assert "WITH dense AS" in sql
        assert "sparse AS" in sql
        assert "FULL OUTER JOIN" in sql
        assert "1.0 / (%(k)s + d.rank)" in sql
        assert "1.0 / (%(k)s + s.rank)" in sql
        assert "embedding <=> %(query_vec)s::vector" in sql
        assert "plainto_tsquery('english', %(topic)s)" in sql
        # Vector rendered as the pgvector text literal.
        assert params["query_vec"] == "[0.1,0.2,0.3]"
        assert params["topic"] == "environment"
        assert params["task_type"] == "read_aloud"
        assert params["k"] == store.RRF_K
        assert params["n"] == 2

    @pytest.mark.anyio
    async def test_theme_without_topic_degrades_to_random(self):
        embed = AsyncMock()
        with (
            patch.object(store, "aembed_query", embed),
            patch.object(store, "_query_db", MagicMock(return_value=[])) as mock_q,
        ):
            await retrieve("read_aloud", mode="theme", topic="   ")
        embed.assert_not_awaited()
        sql, _ = mock_q.call_args.args
        assert "ORDER BY random()" in sql


# ── silent failure ──────────────────────────────────────────────────────────────

class TestFailure:
    @pytest.mark.anyio
    async def test_db_error_returns_empty(self):
        with patch.object(store, "_query_db", MagicMock(side_effect=RuntimeError("db down"))):
            assert await retrieve("read_aloud") == []

    @pytest.mark.anyio
    async def test_embed_error_returns_empty(self):
        with (
            patch.object(store, "aembed_query", AsyncMock(side_effect=RuntimeError("embed down"))),
            patch.object(store, "_query_db", MagicMock(return_value=[])),
        ):
            assert await retrieve("read_aloud", mode="theme", topic="x") == []


# ── get_verbatim ────────────────────────────────────────────────────────────────

class TestGetVerbatim:
    @pytest.mark.anyio
    async def test_returns_single_exemplar_random(self):
        with patch.object(store, "_query_db", MagicMock(return_value=[_row("1", "Verbatim text.")])) as mock_q:
            ex = await get_verbatim("read_aloud")
        assert ex is not None
        assert ex.text == "Verbatim text."
        _, params = mock_q.call_args.args
        assert params["n"] == 1

    @pytest.mark.anyio
    async def test_topic_uses_theme_path(self):
        with (
            patch.object(store, "aembed_query", AsyncMock(return_value=[0.1])) as embed,
            patch.object(store, "_query_db", MagicMock(return_value=[_row("1", "Theme verbatim.")])),
        ):
            ex = await get_verbatim("read_aloud", topic="health")
        assert ex.text == "Theme verbatim."
        embed.assert_awaited_once()

    @pytest.mark.anyio
    async def test_empty_bank_returns_none(self):
        with patch.object(store, "_query_db", MagicMock(return_value=[])):
            assert await get_verbatim("read_aloud") is None
