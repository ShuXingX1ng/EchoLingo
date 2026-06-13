"""
Tests for the Stimulus Exemplar embed + dedup + upsert pipeline.

Covers: sha256 id idempotency, cosine / near-duplicate threshold logic, pgvector
formatting/parsing, upsert statement construction, and the embed_and_upsert
orchestration. All embedding and DB calls are mocked — no real DashScope or
Supabase access.
"""

import json
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from scripts.embed_exemplars import (
    UPSERT_SQL,
    AcceptedExemplar,
    cosine_similarity,
    embed_and_upsert,
    fetch_existing_embeddings,
    format_pgvector,
    is_near_duplicate,
    load_accepted,
    parse_pgvector,
    upsert_exemplar,
)
from scripts.scrape_exemplars.cleaner import sha256_hash


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make(text: str, task_type: str = "read_aloud") -> AcceptedExemplar:
    return AcceptedExemplar(
        task_type=task_type,
        normalized_text=text,
        source_url="https://example.com",
        license="CC BY-SA 4.0",
        reason="llm_skipped",
        word_count=len(text.split()),
        lang="en",
    )


# ── id idempotency ──────────────────────────────────────────────────────────────

class TestId:
    def test_id_is_sha256_of_text(self):
        ex = _make("The quick brown fox.")
        assert ex.id == sha256_hash("The quick brown fox.")

    def test_id_is_stable(self):
        assert _make("same text").id == _make("same text").id

    def test_id_differs_for_different_text(self):
        assert _make("text a").id != _make("text b").id

    def test_id_matches_cleaner_hash(self):
        # Must agree with Agent 2's hashing so upserts are idempotent across stages.
        text = "Some passage that flowed through the cleaner."
        assert _make(text).id == sha256_hash(text)


# ── cosine / near-duplicate ─────────────────────────────────────────────────────

class TestCosine:
    def test_identical_vectors(self):
        v = np.array([1.0, 2.0, 3.0])
        assert cosine_similarity(v, v) == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        assert cosine_similarity(np.array([1.0, 0.0]), np.array([0.0, 1.0])) == pytest.approx(0.0)

    def test_unnormalised_vectors(self):
        # Scaling should not change cosine similarity.
        a, b = np.array([1.0, 1.0]), np.array([3.0, 3.0])
        assert cosine_similarity(a, b) == pytest.approx(1.0)

    def test_zero_vector_is_safe(self):
        assert cosine_similarity(np.zeros(3), np.array([1.0, 2.0, 3.0])) == 0.0


class TestNearDuplicate:
    def test_detects_duplicate_at_threshold(self):
        vec = np.array([1.0, 0.0, 0.0])
        # Nearly identical → cosine ≈ 1.0 ≥ 0.95
        near = np.array([1.0, 0.01, 0.0])
        assert is_near_duplicate(vec, [near]) is True

    def test_below_threshold_not_duplicate(self):
        vec = np.array([1.0, 0.0])
        far = np.array([0.3, 1.0])  # cosine ≈ 0.29
        assert is_near_duplicate(vec, [far]) is False

    def test_threshold_boundary(self):
        vec = np.array([1.0, 0.0])
        # Construct a vector with cosine exactly 0.95.
        angle = np.arccos(0.95)
        other = np.array([np.cos(angle), np.sin(angle)])
        assert is_near_duplicate(vec, [other], threshold=0.95) is True

    def test_empty_others(self):
        assert is_near_duplicate(np.array([1.0, 0.0]), []) is False

    def test_custom_threshold(self):
        vec = np.array([1.0, 0.0])
        other = np.array([0.9, 0.436])  # cosine ≈ 0.9
        assert is_near_duplicate(vec, [other], threshold=0.95) is False
        assert is_near_duplicate(vec, [other], threshold=0.85) is True


# ── pgvector formatting ───────────────────────────────────────────────────────

class TestPgVector:
    def test_format_roundtrip(self):
        vec = [0.1, -0.2, 0.3]
        literal = format_pgvector(vec)
        assert literal.startswith("[") and literal.endswith("]")
        assert np.allclose(parse_pgvector(literal), vec)

    def test_format_numpy_input(self):
        literal = format_pgvector(np.array([1.0, 2.0]))
        assert np.allclose(parse_pgvector(literal), [1.0, 2.0])

    def test_parse_sequence_passthrough(self):
        assert np.allclose(parse_pgvector([1.0, 2.0, 3.0]), [1.0, 2.0, 3.0])


# ── load_accepted ─────────────────────────────────────────────────────────────

class TestLoadAccepted:
    def _write(self, tmp_path, rows):
        path = tmp_path / "wikipedia.jsonl"
        with path.open("w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r) + "\n")
        return tmp_path

    def test_only_accepted_loaded(self, tmp_path):
        self._write(tmp_path, [
            {"task_type": "read_aloud", "normalized_text": "kept", "status": "accept",
             "source_url": "u", "license": "l", "reason": "", "word_count": 1, "lang": "en"},
            {"task_type": "read_aloud", "normalized_text": "dropped", "status": "reject",
             "source_url": "u", "license": "l", "reason": "too_short", "word_count": 1, "lang": "en"},
        ])
        items = load_accepted(tmp_path)
        assert len(items) == 1
        assert items[0].normalized_text == "kept"

    def test_missing_file_skipped(self, tmp_path):
        assert load_accepted(tmp_path, source="nope") == []

    def test_malformed_line_skipped(self, tmp_path):
        path = tmp_path / "wikipedia.jsonl"
        path.write_text(
            '{"task_type":"read_aloud","normalized_text":"ok","status":"accept",'
            '"source_url":"u","license":"l","reason":"","word_count":1,"lang":"en"}\n'
            "{not json}\n",
            encoding="utf-8",
        )
        items = load_accepted(tmp_path)
        assert len(items) == 1


# ── upsert statement construction ───────────────────────────────────────────────

class TestUpsert:
    def test_upsert_executes_with_expected_params(self):
        cur = MagicMock()
        item = _make("hello world")
        vec = [0.1, 0.2, 0.3]
        upsert_exemplar(cur, item, vec)

        cur.execute.assert_called_once()
        sql, params = cur.execute.call_args[0]
        assert sql is UPSERT_SQL
        assert params["id"] == item.id
        assert params["text"] == "hello world"
        assert params["task_type"] == "read_aloud"
        assert params["status"] == "approved"
        assert params["embedding"] == format_pgvector(vec)
        assert params["word_count"] == 2

    def test_upsert_sql_is_idempotent(self):
        assert "ON CONFLICT (id) DO UPDATE" in UPSERT_SQL
        # tsv is DB-generated and must never be written.
        assert "tsv" not in UPSERT_SQL.lower()


class TestFetchExisting:
    def test_parses_rows_into_vectors(self):
        cur = MagicMock()
        cur.fetchall.return_value = [("id1", "[1.0,2.0]"), ("id2", "[3.0,4.0]")]
        result = fetch_existing_embeddings(cur, "read_aloud")
        assert set(result) == {"id1", "id2"}
        assert np.allclose(result["id1"], [1.0, 2.0])
        cur.execute.assert_called_once()


# ── embed_and_upsert orchestration ───────────────────────────────────────────────
# NOTE: embed_and_upsert now takes a *conn* (not a cursor) and commits per task_type.

class TestEmbedAndUpsert:
    def _make_conn(self, existing: dict):
        """Build a mock psycopg2 connection whose cursor returns existing embeddings."""
        cur = MagicMock()
        cur.fetchall.return_value = [(k, format_pgvector(v)) for k, v in existing.items()]
        # cursor() is used as a context manager
        cur.__enter__ = lambda s: s
        cur.__exit__ = MagicMock(return_value=False)
        conn = MagicMock()
        conn.cursor.return_value = cur
        # Expose the underlying cursor so tests can inspect calls
        conn._cur = cur
        return conn

    def test_fresh_inserts_count(self):
        conn = self._make_conn({})
        items = [_make("alpha text"), _make("beta text")]
        # Two clearly distinct embeddings.
        with patch("scripts.embed_exemplars.embed_texts", return_value=[[1.0, 0.0], [0.0, 1.0]]):
            upserted, dropped = embed_and_upsert(conn, items)
        assert (upserted, dropped) == (2, 0)
        cur = conn._cur
        upsert_calls = [c for c in cur.execute.call_args_list if c.args[0] is UPSERT_SQL]
        assert len(upsert_calls) == 2

    def test_near_duplicate_in_batch_dropped(self):
        conn = self._make_conn({})
        items = [_make("first"), _make("near dup of first")]
        with patch("scripts.embed_exemplars.embed_texts", return_value=[[1.0, 0.0], [1.0, 0.01]]):
            upserted, dropped = embed_and_upsert(conn, items)
        assert upserted == 1
        assert dropped == 1

    def test_near_duplicate_against_stored_dropped(self):
        existing = {"stored_id": np.array([1.0, 0.0])}
        conn = self._make_conn(existing)
        items = [_make("new but near stored")]
        with patch("scripts.embed_exemplars.embed_texts", return_value=[[1.0, 0.02]]):
            upserted, dropped = embed_and_upsert(conn, items)
        assert (upserted, dropped) == (0, 1)

    def test_existing_id_skipped_without_force(self):
        item = _make("already stored")
        existing = {item.id: np.array([0.5, 0.5])}
        conn = self._make_conn(existing)
        embed_mock = MagicMock()
        with patch("scripts.embed_exemplars.embed_texts", embed_mock):
            upserted, dropped = embed_and_upsert(conn, [item], force=False)
        assert (upserted, dropped) == (0, 0)
        embed_mock.assert_not_called()  # no embedding cost for already-stored items

    def test_force_reembeds_existing(self):
        item = _make("already stored")
        existing = {item.id: np.array([1.0, 0.0])}
        conn = self._make_conn(existing)
        # Self-id is excluded from dedup comparison, so a force re-embed upserts.
        with patch("scripts.embed_exemplars.embed_texts", return_value=[[1.0, 0.0]]):
            upserted, dropped = embed_and_upsert(conn, [item], force=True)
        assert (upserted, dropped) == (1, 0)

    def test_per_task_type_isolation(self):
        # A near-identical vector in a different task_type must NOT be a duplicate.
        conn = self._make_conn({})
        items = [_make("x", task_type="read_aloud"), _make("y", task_type="summarize_written_text")]
        with patch("scripts.embed_exemplars.embed_texts", return_value=[[1.0, 0.0]]) as m:
            upserted, dropped = embed_and_upsert(conn, items)
        # embed_texts called once per task_type group.
        assert m.call_count == 2
        assert (upserted, dropped) == (2, 0)
