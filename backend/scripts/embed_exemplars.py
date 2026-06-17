#!/usr/bin/env python3
"""
Embed + near-dedup + upsert for Stimulus Exemplars (Phase Data-1, second half).

Reads  backend/data/exemplars_clean/<source>.jsonl  (Agent 2 output)
Embeds accepted entries with DashScope text-embedding-v4 (1024-dim), drops
near-duplicates (per task_type, cosine ≥ 0.95 against already-stored or
in-batch vectors), and upserts into the `stimulus_exemplars` table (migration
004) over a direct service-role Postgres connection.

Idempotency: id = sha256(normalized_text), matching the cleaner. Re-running is a
no-op for already-stored items unless --force re-embeds them. ON CONFLICT (id)
DO UPDATE keeps the row in sync. The generated `tsv` column is maintained by the
DB and never written here.

Usage (from backend/):
    python scripts/embed_exemplars.py                    # embed all clean sources
    python scripts/embed_exemplars.py --source wikipedia # one source
    python scripts/embed_exemplars.py --force            # re-embed existing rows

Requires env vars: DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL (optional), SUPABASE_DB_URL

Backend-only: exemplar text is never written to git or exposed to the frontend.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Ensure backend/ is importable when called from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.scrape_exemplars.cleaner import sha256_hash
from services.vector_store import embed_texts

CLEAN_DIR = Path(__file__).resolve().parent.parent / "data" / "exemplars_clean"

# Per task_type near-duplicate threshold: cosine similarity ≥ this is a near-dup.
NEAR_DUP_THRESHOLD = 0.95

# Rows enter the table already passed through the cleaner's accept gate.
DB_STATUS_ACCEPTED = "approved"

UPSERT_SQL = """
INSERT INTO stimulus_exemplars
    (id, task_type, text, embedding, source_url, license,
     status, reason, word_count, lang)
VALUES
    (%(id)s, %(task_type)s, %(text)s, %(embedding)s, %(source_url)s, %(license)s,
     %(status)s, %(reason)s, %(word_count)s, %(lang)s)
ON CONFLICT (id, task_type) DO UPDATE SET
    text       = EXCLUDED.text,
    embedding  = EXCLUDED.embedding,
    source_url = EXCLUDED.source_url,
    license    = EXCLUDED.license,
    status     = EXCLUDED.status,
    reason     = EXCLUDED.reason,
    word_count = EXCLUDED.word_count,
    lang       = EXCLUDED.lang
"""


@dataclass
class AcceptedExemplar:
    """One status=accept entry from a clean JSONL file."""

    task_type: str
    normalized_text: str
    source_url: str
    license: str
    reason: str
    word_count: int
    lang: str

    @property
    def id(self) -> str:
        return sha256_hash(self.normalized_text)


# ── Loading ───────────────────────────────────────────────────────────────────

def load_accepted(clean_dir: Path, source: str | None = None) -> list[AcceptedExemplar]:
    """Load status=accept entries from clean JSONL file(s)."""
    if source:
        paths = [clean_dir / f"{source}.jsonl"]
    else:
        paths = sorted(clean_dir.glob("*.jsonl"))

    accepted: list[AcceptedExemplar] = []
    for path in paths:
        if not path.exists():
            print(f"[skip] {path} not found.")
            continue
        with path.open(encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except json.JSONDecodeError as exc:
                    print(f"  [warn] skipping malformed line {lineno} in {path.name}: {exc}")
                    continue
                if d.get("status") != "accept":
                    continue
                accepted.append(
                    AcceptedExemplar(
                        task_type=d["task_type"],
                        normalized_text=d["normalized_text"],
                        source_url=d.get("source_url", ""),
                        license=d.get("license", ""),
                        reason=d.get("reason", ""),
                        word_count=d.get("word_count", 0),
                        lang=d.get("lang", "en"),
                    )
                )
    return accepted


# ── Vector helpers ──────────────────────────────────────────────────────────────

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D vectors. Returns 0.0 if either is zero."""
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def is_near_duplicate(
    vec: np.ndarray, others: list[np.ndarray], threshold: float = NEAR_DUP_THRESHOLD
) -> bool:
    """True if `vec` is within `threshold` cosine of any vector in `others`."""
    return any(cosine_similarity(vec, other) >= threshold for other in others)


def format_pgvector(vec: list[float] | np.ndarray) -> str:
    """Render a vector as the pgvector text literal '[v1,v2,...]'."""
    values = vec.tolist() if isinstance(vec, np.ndarray) else list(vec)
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


def parse_pgvector(raw) -> np.ndarray:
    """Parse a pgvector value (text literal or sequence) into a numpy array."""
    if isinstance(raw, str):
        return np.asarray(json.loads(raw), dtype=float)
    return np.asarray(raw, dtype=float)


# ── DB access ───────────────────────────────────────────────────────────────────

def get_connection():
    """Open a direct service-role Postgres connection (bypasses RLS)."""
    import psycopg2  # deferred — not needed in tests, which mock the connection

    return psycopg2.connect(os.environ["SUPABASE_DB_URL"])


def fetch_existing_embeddings(cur, task_type: str) -> dict[str, np.ndarray]:
    """Return {id: embedding} for stored rows of a task_type (skips NULL embeddings)."""
    cur.execute(
        "SELECT id, embedding FROM stimulus_exemplars "
        "WHERE task_type = %(task_type)s AND embedding IS NOT NULL",
        {"task_type": task_type},
    )
    return {row[0]: parse_pgvector(row[1]) for row in cur.fetchall()}


def upsert_exemplar(cur, item: AcceptedExemplar, vector: list[float] | np.ndarray) -> None:
    """Execute the idempotent upsert for one exemplar."""
    cur.execute(
        UPSERT_SQL,
        {
            "id": item.id,
            "task_type": item.task_type,
            "text": item.normalized_text,
            "embedding": format_pgvector(vector),
            "source_url": item.source_url,
            "license": item.license,
            "status": DB_STATUS_ACCEPTED,
            "reason": item.reason,
            "word_count": item.word_count,
            "lang": item.lang,
        },
    )


# ── Orchestration ───────────────────────────────────────────────────────────────

def embed_and_upsert(
    conn,
    accepted: list[AcceptedExemplar],
    force: bool = False,
) -> tuple[int, int]:
    """Embed, near-dedup (per task_type), and upsert.

    Each task_type group is committed immediately after processing so that
    a transient network error for one group does not roll back all others.
    Returns (upserted, near_dup_dropped).
    """
    by_task: dict[str, list[AcceptedExemplar]] = defaultdict(list)
    for item in accepted:
        by_task[item.task_type].append(item)

    upserted = 0
    near_dup_dropped = 0

    for task_type, group in by_task.items():
        try:
            with conn.cursor() as cur:
                existing = fetch_existing_embeddings(cur, task_type)

                # Skip items already stored unless --force (id is text-derived).
                pending = [it for it in group if force or it.id not in existing]
                if not pending:
                    print(f"[{task_type}] nothing new to embed ({len(group)} already stored).")
                    continue

                print(f"[{task_type}] embedding {len(pending)} item(s) via DashScope…")
                PROGRESS_BATCH = 100
                all_vecs: list[list[float]] = []
                for batch_start in range(0, len(pending), PROGRESS_BATCH):
                    batch = pending[batch_start : batch_start + PROGRESS_BATCH]
                    all_vecs.extend(embed_texts([it.normalized_text for it in batch]))
                    done = min(batch_start + PROGRESS_BATCH, len(pending))
                    print(f"  [{task_type}] embedded {done}/{len(pending)} …", flush=True)
                vectors = [np.asarray(v, dtype=float) for v in all_vecs]

                # Build a single L2-normalised matrix from existing embeddings once
                # per task_type so the per-item check is one BLAS call instead of
                # an O(N) Python-level list copy + Python-loop cosine computation.
                existing_ids = list(existing.keys())
                dim = len(vectors[0]) if vectors else 1024
                if existing_ids:
                    ex_mat = np.vstack([existing[k] for k in existing_ids])
                    ex_norms = np.linalg.norm(ex_mat, axis=1, keepdims=True)
                    ex_norms = np.where(ex_norms == 0.0, 1.0, ex_norms)
                    ex_normed = ex_mat / ex_norms  # (E, D) L2-normalised
                    id_to_row: dict[str, int] = {id_: i for i, id_ in enumerate(existing_ids)}
                else:
                    ex_normed = np.empty((0, dim), dtype=float)
                    id_to_row = {}

                # Pre-allocate buffer for batch-kept normalised vectors (avoids
                # repeated np.vstack copies as the buffer grows).
                kept_normed = np.empty((len(pending), dim), dtype=float)
                kept_count = 0

                for item, vec in zip(pending, vectors):
                    norm = float(np.linalg.norm(vec))
                    if norm == 0.0:
                        near_dup_dropped += 1
                        continue
                    vec_hat = vec / norm

                    # One BLAS call vs all existing stored vectors.
                    if ex_normed.shape[0] > 0:
                        sims = ex_normed @ vec_hat
                        exclude = id_to_row.get(item.id)
                        if exclude is not None:
                            sims[exclude] = -2.0  # mask self-comparison in --force mode
                        if float(sims.max()) >= NEAR_DUP_THRESHOLD:
                            near_dup_dropped += 1
                            continue

                    # One BLAS call vs already-kept batch vectors.
                    if kept_count > 0 and float((kept_normed[:kept_count] @ vec_hat).max()) >= NEAR_DUP_THRESHOLD:
                        near_dup_dropped += 1
                        continue

                    upsert_exemplar(cur, item, vec)
                    kept_normed[kept_count] = vec_hat
                    kept_count += 1
                    upserted += 1

            # Commit immediately after each task_type so partial results are durable.
            conn.commit()
            print(f"[{task_type}] committed {kept_count} rows.")

        except Exception as exc:
            print(f"[{task_type}] ERROR: {exc} — skipping this task type, rolling back.")
            conn.rollback()

    return upserted, near_dup_dropped


def run(source: str | None = None, force: bool = False) -> int:
    if not CLEAN_DIR.exists():
        print(f"Clean data directory not found: {CLEAN_DIR}", file=sys.stderr)
        print("Run the cleaner first: python scripts/clean_exemplars.py", file=sys.stderr)
        return 1

    accepted = load_accepted(CLEAN_DIR, source=source)
    if not accepted:
        print("No accepted exemplars found. Nothing to embed.")
        return 0

    print(f"Loaded {len(accepted)} accepted exemplar(s).")

    conn = get_connection()
    try:
        upserted, near_dup_dropped = embed_and_upsert(conn, accepted, force=force)
    finally:
        conn.close()

    print(f"\nDone. Upserted={upserted}  near-duplicates dropped={near_dup_dropped}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Embed + dedup + upsert Stimulus Exemplars.")
    parser.add_argument(
        "--source",
        default=None,
        help="Source name (stem of the clean JSONL file). Defaults to all files in exemplars_clean/.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed and upsert entries that already exist in the table.",
    )
    args = parser.parse_args()
    return run(source=args.source, force=args.force)


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    raise SystemExit(main())
