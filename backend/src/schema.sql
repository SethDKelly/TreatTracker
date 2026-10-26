-- Applied automatically by the Lambda on first request (CREATE IF NOT EXISTS).
-- Kept here for documentation and manual ops.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  cognito_sub TEXT PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treat_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_sub TEXT NOT NULL REFERENCES users (cognito_sub) ON DELETE CASCADE,
  count INTEGER NOT NULL CHECK (count >= 0),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS treat_counts_user_recorded_idx
  ON treat_counts (user_sub, recorded_at DESC);
