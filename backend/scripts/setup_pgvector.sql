-- One-time Supabase setup for the RAG vector store (Phase RAG-3).
-- Run this in the Supabase dashboard SQL editor BEFORE running seed_rubrics.py.
--
-- The vecs client (used by services/vector_store.py and scripts/seed_rubrics.py)
-- creates its own "vecs"."rubric_chunks" table on first connection, so the only
-- required step is enabling the pgvector extension.

create extension if not exists vector;

-- Verify:
--   select extname, extversion from pg_extension where extname = 'vector';
--
-- After running seed_rubrics.py, verify the seeded collection:
--   select count(*) from vecs.rubric_chunks;
