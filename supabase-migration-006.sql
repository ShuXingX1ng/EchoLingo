-- Migration 006: Add practice_tasks table for cloud task history
--
-- Stores each completed PTE practice attempt per user.
-- RLS ensures users can only read/write their own rows.
--
-- Run once on the Supabase dashboard SQL editor:
--   \i supabase-migration-006.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.practice_tasks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_type        text        NOT NULL,
  stimulus         jsonb       NOT NULL,
  response         jsonb       NOT NULL,
  feedback         jsonb,
  duration_seconds integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz
);

ALTER TABLE public.practice_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tasks"
  ON public.practice_tasks
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for efficient per-user history queries
CREATE INDEX IF NOT EXISTS practice_tasks_user_created
  ON public.practice_tasks (user_id, created_at DESC);

-- Index for per-user per-type queries (used by getTasksByTypeFromCloud)
CREATE INDEX IF NOT EXISTS practice_tasks_user_type
  ON public.practice_tasks (user_id, task_type, created_at DESC);

COMMIT;
