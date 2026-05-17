-- 2026-05-17c_add_analyze_jobs.sql
--
-- Adds the analyze_jobs table + two supporting enums for the Phase D
-- async pipeline at POST /api/tracks/analyze.
--
-- Each row represents one in-flight or completed upload analysis. The
-- Vercel route inserts at status='queued', kicks off the worker call
-- via @vercel/functions waitUntil, then the background runner walks
-- the row through running -> done|failed, writing the resulting
-- trackId (and other detector output) into result jsonb.
--
-- Identifier semantics parallel rate_limits / upload_analyses:
--   "user:<userId>"        authenticated callers
--   "ip:<sha256(salt+ip)>" anonymous callers
-- GET /api/tracks/analyze/jobs/[id] uses identifier match for auth so
-- callers see only their own jobs.
--
-- method enum: which detector this job uses ('template' is the legacy
-- duration-banded suggester; 'foote' and 'ml' are Phase D detectors).
-- The A/B router in PR-D writes one of these per job.
--
-- Apply against Neon (or any Postgres) via:
--   psql "$DATABASE_URL" -f scripts/migrations/2026-05-17c_add_analyze_jobs.sql
--
-- Or apply all current schema additions in one shot via:
--   npx drizzle-kit push
--
-- Idempotent: safe to re-run.

DO $$ BEGIN
  CREATE TYPE analyze_job_status AS ENUM ('queued', 'running', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE analyze_method AS ENUM ('template', 'foote', 'ml');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS analyze_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  method analyze_method NOT NULL,
  status analyze_job_status NOT NULL DEFAULT 'queued',
  audio_size_bytes integer NOT NULL,
  mime text NOT NULL,
  title text NOT NULL,
  result jsonb,
  error_text text,
  track_id uuid REFERENCES tracks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS analyze_jobs_identifier_status_idx
  ON analyze_jobs (identifier, status);
