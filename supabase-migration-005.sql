-- Migration 005: Composite primary key on stimulus_exemplars (id, task_type)
--
-- Problem being solved:
--   The original PK was (id) where id = sha256(text). This meant the same
--   passage text could only be stored once, even if it is a valid exemplar
--   anchor for multiple task types (e.g., the same 150-word paragraph can
--   calibrate both fill_in_the_blanks_reading and summarize_written_text).
--
-- Fix:
--   Change the PK to (id, task_type). This lets the same text appear once
--   per task type it is relevant to, while still preventing exact-duplicate
--   (text, task_type) pairs from being inserted twice.
--
-- Downstream changes required alongside this migration:
--   • cleaner.py      — dedup key changed to (sha256(text), task_type)
--   • embed_exemplars.py — ON CONFLICT target changed to (id, task_type)
--
-- Existing data is unaffected: every existing row already has a unique
-- (id, task_type) pair because the old PK on id guaranteed global uniqueness.
-- The task_type btree index and the HNSW index on embedding are unaffected.
--
-- Run once on the Supabase dashboard SQL editor (or psql):
--   \i supabase-migration-005.sql

BEGIN;

ALTER TABLE stimulus_exemplars DROP CONSTRAINT stimulus_exemplars_pkey;

ALTER TABLE stimulus_exemplars
    ADD CONSTRAINT stimulus_exemplars_pkey PRIMARY KEY (id, task_type);

COMMIT;
