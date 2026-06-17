-- EchoLingo Migration 004: Stimulus Exemplars
-- Purpose: shared retrieval-only corpus used to seed Stimulus generation via
--   hybrid retrieval (dense pgvector + sparse tsvector, fused with RRF).
--   See ADR 0008 (stimulus-exemplar-model) and ADR 0009 (hybrid-retrieval).
--
-- Dependencies:
--   - pgvector extension must be enabled (run setup_pgvector.sql or migration uses
--     CREATE EXTENSION IF NOT EXISTS vector below as a safety guard).
--   - Run AFTER supabase-migration-002.sql and supabase-migration-003.sql.
--
-- Access: backend service-role only. RLS is ENABLED with no policies, so the
--   auto-exposed PostgREST API denies all anon/authenticated access by default.
--   The backend reaches this table via a direct Postgres connection
--   (SUPABASE_DB_URL, as the table owner), which bypasses RLS — so backend
--   access is unaffected. Exemplars are never returned verbatim to the client on
--   the default path anyway (ADR 0009 §2).

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- stimulus_exemplars table
-- ============================================================

CREATE TABLE IF NOT EXISTS stimulus_exemplars (
  -- sha256(normalized_text) — enables idempotent upserts without a sequence PK
  id          TEXT PRIMARY KEY,

  task_type   TEXT NOT NULL,
  text        TEXT NOT NULL,

  -- 1024-dim embedding produced by DashScope text-embedding-v4 (matches existing
  -- vector_store.py / rag.py pipeline dimension).
  embedding   vector(1024),

  -- Full-text search column. GENERATED so it stays in sync with `text` without
  -- application-level maintenance.
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,

  source_url  TEXT,
  license     TEXT,

  -- Ingestion lifecycle: 'pending' | 'approved' | 'rejected'
  status      TEXT,
  reason      TEXT,   -- reviewer note when status = 'rejected'

  difficulty  TEXT,   -- e.g. 'low' | 'medium' | 'high'
  features    JSONB   NOT NULL DEFAULT '{}',
  word_count  INT,
  lang        TEXT    NOT NULL DEFAULT 'en',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================
-- Backend-only table. Enabling RLS with NO policies makes the PostgREST-exposed
-- API deny every anon/authenticated request, while the backend's direct Postgres
-- connection (table owner / service-role) bypasses RLS and retains full access.
ALTER TABLE stimulus_exemplars ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Indexes
-- ============================================================

-- Full-text (sparse) retrieval — used by Theme Practice hybrid query.
CREATE INDEX IF NOT EXISTS idx_stimulus_exemplars_tsv
  ON stimulus_exemplars USING GIN (tsv);

-- Dense retrieval — cosine similarity via pgvector.
-- hnsw gives sub-linear ANN at query time; lists value below can be tuned once
-- the corpus grows beyond ~10 k rows (rule of thumb: sqrt(row_count)).
CREATE INDEX IF NOT EXISTS idx_stimulus_exemplars_embedding
  ON stimulus_exemplars USING hnsw (embedding vector_cosine_ops);

-- Metadata filter — task_type equality filter applied before vector search in
-- both random/targeted and theme retrieval paths.
CREATE INDEX IF NOT EXISTS idx_stimulus_exemplars_task_type
  ON stimulus_exemplars (task_type);
