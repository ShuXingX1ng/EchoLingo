"""
Unit tests for services/rag.py.
All vector store and embedding calls are mocked — no network, DB, or vecs install required.
"""

import sys
import types
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Stub out heavy optional dependencies before any services.* import
# ---------------------------------------------------------------------------

def _stub_vecs():
    """Insert a minimal vecs stub into sys.modules so vector_store.py can import."""
    vecs_mod = types.ModuleType("vecs")
    vecs_mod.create_client = MagicMock()
    sys.modules.setdefault("vecs", vecs_mod)


_stub_vecs()

# Now it's safe to import the services
import importlib
import services.vector_store  # noqa: E402  — must come after stub
import services.rag            # noqa: E402  — must come after vector_store


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_vecs_result(texts: list[str]) -> list[tuple]:
    """Build the (id, metadata, score) tuple list that vecs.Collection.query returns."""
    return [(f"id-{i}", {"task_type": "read_aloud", "text": t}, 0.9) for i, t in enumerate(texts)]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_retrieve_context_returns_joined_text():
    chunks = ["Chunk A content.", "Chunk B content."]
    expected = "Chunk A content.\n\nChunk B content."

    with (
        patch("services.rag.aembed_query", new=AsyncMock(return_value=[0.1] * 1536)),
        patch("services.rag.get_vecs_collection") as mock_col_factory,
    ):
        mock_collection = MagicMock()
        mock_collection.query.return_value = _make_vecs_result(chunks)
        mock_col_factory.return_value = mock_collection

        result = await services.rag.retrieve_context("read_aloud")

    assert result == expected


@pytest.mark.anyio
async def test_retrieve_context_empty_when_no_results():
    with (
        patch("services.rag.aembed_query", new=AsyncMock(return_value=[0.0] * 1536)),
        patch("services.rag.get_vecs_collection") as mock_col_factory,
    ):
        mock_collection = MagicMock()
        mock_collection.query.return_value = []
        mock_col_factory.return_value = mock_collection

        result = await services.rag.retrieve_context("repeat_sentence")

    assert result == ""


@pytest.mark.anyio
async def test_retrieve_context_returns_empty_on_embed_error():
    with patch("services.rag.aembed_query", new=AsyncMock(side_effect=RuntimeError("embed failed"))):
        result = await services.rag.retrieve_context("write_essay")

    assert result == ""


@pytest.mark.anyio
async def test_retrieve_context_returns_empty_on_db_error():
    with (
        patch("services.rag.aembed_query", new=AsyncMock(return_value=[0.1] * 1536)),
        patch("services.rag.get_vecs_collection", side_effect=RuntimeError("db down")),
    ):
        result = await services.rag.retrieve_context("summarize_written_text")

    assert result == ""


@pytest.mark.anyio
async def test_retrieve_context_skips_chunks_without_text():
    """Metadata entries with no 'text' key or empty text are silently skipped."""
    raw_results = [
        ("id-1", {"task_type": "read_aloud"}, 0.9),               # no 'text' key
        ("id-2", {"task_type": "read_aloud", "text": ""}, 0.8),   # empty string
        ("id-3", {"task_type": "read_aloud", "text": "Valid chunk."}, 0.7),
    ]

    with (
        patch("services.rag.aembed_query", new=AsyncMock(return_value=[0.1] * 1536)),
        patch("services.rag.get_vecs_collection") as mock_col_factory,
    ):
        mock_collection = MagicMock()
        mock_collection.query.return_value = raw_results
        mock_col_factory.return_value = mock_collection

        result = await services.rag.retrieve_context("read_aloud")

    assert result == "Valid chunk."


@pytest.mark.anyio
async def test_retrieve_context_passes_task_type_filter():
    """The vecs query must include a task_type equality filter."""
    with (
        patch("services.rag.aembed_query", new=AsyncMock(return_value=[0.1] * 1536)),
        patch("services.rag.get_vecs_collection") as mock_col_factory,
    ):
        mock_collection = MagicMock()
        mock_collection.query.return_value = []
        mock_col_factory.return_value = mock_collection

        await services.rag.retrieve_context("fill_in_the_blanks_reading")

        call_kwargs = mock_collection.query.call_args.kwargs
        assert call_kwargs["filters"] == {"task_type": {"$eq": "fill_in_the_blanks_reading"}}
