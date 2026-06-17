"""
Stimulus Exemplar Store

Retrieval over the `stimulus_exemplars` table (migration 004) for the three
Stimulus practice modes (ADR 0009):

  - random   — sample N approved Exemplars by Task Type (plain/Mock practice).
  - targeted — filter by Task Type + difficulty/features (Daily Plan weakness).
  - theme    — hybrid retrieval: pgvector dense + Postgres tsvector sparse, fused
               with Reciprocal Rank Fusion (RRF) in a single SQL statement.

Plus get_verbatim() for the private "practice the real question" path
(verbatim=true), which returns one Exemplar's original text unmodified.

Backend service-role access via a direct Postgres connection (SUPABASE_DB_URL),
which bypasses RLS. Exemplar text is never returned to the client on the default
generation path — only on the explicit verbatim path (ADR 0008 §1).

All blocking DB work runs in a worker thread so the async router event loop is
never blocked. Every external call (embedding, DB) is mocked in tests.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Optional

from services.vector_store import aembed_query

logger = logging.getLogger(__name__)

# Default number of few-shot anchors retrieved per generation.
DEFAULT_N = 3

# Candidate pool size pulled from each retriever before RRF fusion (theme mode).
THEME_POOL = 50

# RRF damping constant. 60 is the canonical value from the original RRF paper;
# it keeps top ranks dominant without letting rank-1 swamp everything.
RRF_K = 60

# Only rows that passed ingestion review are eligible for retrieval.
APPROVED_STATUS = "approved"

# Columns selected for every Exemplar; kept in one place so the dense/sparse
# CTEs and the plain queries stay in sync.
_COLUMNS = "id, task_type, text, difficulty, features, source_url, license"


@dataclass
class Exemplar:
    """One retrieved Stimulus Exemplar (a generation anchor, not a served Stimulus)."""

    id: str
    task_type: str
    text: str
    difficulty: Optional[str] = None
    features: dict = field(default_factory=dict)
    source_url: Optional[str] = None
    license: Optional[str] = None

    @classmethod
    def from_row(cls, row: dict) -> "Exemplar":
        return cls(
            id=row["id"],
            task_type=row["task_type"],
            text=row["text"],
            difficulty=row.get("difficulty"),
            features=row.get("features") or {},
            source_url=row.get("source_url"),
            license=row.get("license"),
        )


# ── DB access ───────────────────────────────────────────────────────────────────

def get_connection():
    """Open a direct service-role Postgres connection (bypasses RLS)."""
    import psycopg2  # deferred — tests mock _query_db, never opening a real connection

    return psycopg2.connect(os.environ["SUPABASE_DB_URL"])


def _query_db(sql: str, params: dict) -> list[dict]:
    """Run a read query and return rows as dicts. Synchronous — call via to_thread."""
    from psycopg2.extras import RealDictCursor  # deferred for the same reason

    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


async def _aquery(sql: str, params: dict) -> list[dict]:
    """Async wrapper that offloads the blocking DB call to a worker thread."""
    return await asyncio.to_thread(_query_db, sql, params)


# ── SQL builders ──────────────────────────────────────────────────────────────

_RANDOM_SQL = f"""
SELECT {_COLUMNS}
FROM stimulus_exemplars
WHERE task_type = %(task_type)s AND status = %(status)s
ORDER BY random()
LIMIT %(n)s
"""

# Hybrid retrieval for Theme Practice. Dense (cosine) and sparse (full-text)
# retrievers each rank a candidate pool; RRF fuses them in one statement.
_THEME_SQL = f"""
WITH dense AS (
    SELECT {_COLUMNS},
           ROW_NUMBER() OVER (ORDER BY embedding <=> %(query_vec)s::vector) AS rank
    FROM stimulus_exemplars
    WHERE task_type = %(task_type)s AND status = %(status)s AND embedding IS NOT NULL
    ORDER BY embedding <=> %(query_vec)s::vector
    LIMIT %(pool)s
),
sparse AS (
    SELECT {_COLUMNS},
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, query) DESC) AS rank
    FROM stimulus_exemplars, plainto_tsquery('english', %(topic)s) AS query
    WHERE task_type = %(task_type)s AND status = %(status)s AND tsv @@ query
    ORDER BY ts_rank_cd(tsv, query) DESC
    LIMIT %(pool)s
)
SELECT
    COALESCE(d.id, s.id)                 AS id,
    COALESCE(d.task_type, s.task_type)   AS task_type,
    COALESCE(d.text, s.text)             AS text,
    COALESCE(d.difficulty, s.difficulty) AS difficulty,
    COALESCE(d.features, s.features)     AS features,
    COALESCE(d.source_url, s.source_url) AS source_url,
    COALESCE(d.license, s.license)       AS license,
    COALESCE(1.0 / (%(k)s + d.rank), 0.0)
        + COALESCE(1.0 / (%(k)s + s.rank), 0.0) AS rrf_score
FROM dense d
FULL OUTER JOIN sparse s ON d.id = s.id
ORDER BY rrf_score DESC
LIMIT %(n)s
"""


def _build_targeted_sql(targeting: Optional[dict]) -> tuple[str, dict]:
    """Build the targeted-mode SQL + params from optional difficulty/features filters."""
    where = ["task_type = %(task_type)s", "status = %(status)s"]
    params: dict[str, Any] = {}

    targeting = targeting or {}
    difficulty = targeting.get("difficulty")
    if difficulty:
        where.append("difficulty = %(difficulty)s")
        params["difficulty"] = difficulty

    features = targeting.get("features")
    if features:
        import json

        # Containment: row's features JSONB must include every requested key/value.
        where.append("features @> %(features)s::jsonb")
        params["features"] = json.dumps(features)

    sql = (
        f"SELECT {_COLUMNS}\n"
        "FROM stimulus_exemplars\n"
        f"WHERE {' AND '.join(where)}\n"
        "ORDER BY random()\n"
        "LIMIT %(n)s"
    )
    return sql, params


# ── Public retrieval API ──────────────────────────────────────────────────────

async def retrieve(
    task_type: str,
    mode: str = "random",
    topic: Optional[str] = None,
    targeting: Optional[dict] = None,
    n: int = DEFAULT_N,
) -> list[Exemplar]:
    """
    Retrieve up to `n` approved Exemplars for a Task Type under the given mode.

    Returns [] (never raises) when nothing matches or the store is unavailable,
    so callers can fall back to pure-AI generation silently (ADR 0007 / 0008 §4).
    """
    try:
        if mode == "theme":
            if not topic or not topic.strip():
                # No query to drive hybrid retrieval — degrade to random sampling.
                return await retrieve(task_type, mode="random", n=n)
            query_vec = await aembed_query(topic)
            from scripts.embed_exemplars import format_pgvector

            rows = await _aquery(
                _THEME_SQL,
                {
                    "task_type": task_type,
                    "status": APPROVED_STATUS,
                    "query_vec": format_pgvector(query_vec),
                    "topic": topic,
                    "pool": THEME_POOL,
                    "k": RRF_K,
                    "n": n,
                },
            )
        elif mode == "targeted":
            sql, extra = _build_targeted_sql(targeting)
            params = {"task_type": task_type, "status": APPROVED_STATUS, "n": n, **extra}
            rows = await _aquery(sql, params)
        else:  # random (default) — also the fallback for Mock and unknown modes
            rows = await _aquery(
                _RANDOM_SQL,
                {"task_type": task_type, "status": APPROVED_STATUS, "n": n},
            )

        return [Exemplar.from_row(r) for r in rows]

    except Exception as exc:
        logger.warning(
            "Exemplar retrieval failed (task_type=%s mode=%s): %s", task_type, mode, exc
        )
        return []


async def get_verbatim(task_type: str, topic: Optional[str] = None) -> Optional[Exemplar]:
    """
    Return one Exemplar's original text for the private verbatim path.

    With a topic, the single best theme match is returned; otherwise a random
    approved Exemplar. Returns None when the bank is empty or unavailable, so the
    caller can fall through to generation.
    """
    mode = "theme" if topic and topic.strip() else "random"
    results = await retrieve(task_type, mode=mode, topic=topic, n=1)
    return results[0] if results else None
