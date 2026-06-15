-- EchoLingo Phase H2a Migration: User Error Patterns
-- Run this AFTER supabase-migration-001.sql

-- ============================================================
-- 1. User Error Patterns table
-- ============================================================

CREATE TABLE IF NOT EXISTS user_error_patterns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL CHECK (error_type IN ('grammar', 'vocabulary', 'fluency', 'pronunciation')),
  pattern TEXT NOT NULL,
  examples JSONB DEFAULT '[]',
  frequency INTEGER DEFAULT 1,
  last_occurred_at TIMESTAMPTZ DEFAULT NOW(),
  improvement TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, pattern)
);

-- RLS for user_error_patterns
ALTER TABLE user_error_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own error patterns"
  ON user_error_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own error patterns"
  ON user_error_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own error patterns"
  ON user_error_patterns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own error patterns"
  ON user_error_patterns FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_error_patterns_user_id ON user_error_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_user_error_patterns_type ON user_error_patterns(error_type);
CREATE INDEX IF NOT EXISTS idx_user_error_patterns_frequency ON user_error_patterns(user_id, frequency DESC);

-- ============================================================
-- 2. User Weak Areas Summary table (for quick access)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_weak_areas (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  weak_skills JSONB DEFAULT '[]',
  top_errors JSONB DEFAULT '{}',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for user_weak_areas
ALTER TABLE user_weak_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weak areas"
  ON user_weak_areas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weak areas"
  ON user_weak_areas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weak areas"
  ON user_weak_areas FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. Function to update weak areas summary
-- ============================================================

CREATE OR REPLACE FUNCTION update_user_weak_areas()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the weak areas summary whenever error patterns change
  INSERT INTO user_weak_areas (user_id, weak_skills, top_errors, last_updated)
  SELECT
    user_id,
    ARRAY_AGG(DISTINCT error_type ORDER BY error_type),
    jsonb_object_agg(error_type, pattern),
    NOW()
  FROM (
    SELECT DISTINCT ON (error_type)
      user_id,
      error_type,
      pattern
    FROM user_error_patterns
    WHERE user_id = NEW.user_id
    ORDER BY error_type, frequency DESC
  ) top_patterns
  GROUP BY user_id
  ON CONFLICT (user_id) DO UPDATE SET
    weak_skills = EXCLUDED.weak_skills,
    top_errors = EXCLUDED.top_errors,
    last_updated = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update weak areas
CREATE TRIGGER update_weak_areas_on_error_change
  AFTER INSERT OR UPDATE OR DELETE ON user_error_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_user_weak_areas();
