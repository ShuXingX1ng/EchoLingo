-- EchoLingo Migration 003: Vocabulary List (Study Aids)
-- Run this AFTER supabase-migration-002.sql
--
-- Backs the Vocabulary List feature (ADR 0006). Words enter only by an explicit
-- save on the Word Lookup card; this feature syncs to the cloud from v1 so a
-- learner's saved words survive a browser/device switch.

-- ============================================================
-- Vocabulary table
-- ============================================================

CREATE TABLE IF NOT EXISTS vocabulary (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  phonetic    TEXT DEFAULT '',
  source      TEXT NOT NULL CHECK (source IN ('dictionary', 'ai')),
  entries     JSONB NOT NULL DEFAULT '[]', -- [{ pos, meaning }]
  tags        JSONB NOT NULL DEFAULT '[]', -- ["雅思", "托福", ...]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One saved entry per word per learner (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_user_text
  ON vocabulary (user_id, lower(text));

CREATE INDEX IF NOT EXISTS idx_vocabulary_user_created
  ON vocabulary (user_id, created_at DESC);

-- RLS
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vocabulary"
  ON vocabulary FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vocabulary"
  ON vocabulary FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vocabulary"
  ON vocabulary FOR DELETE
  USING (auth.uid() = user_id);
