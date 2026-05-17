-- 2026-05-17_add_rate_limits.sql
--
-- Adds the rate_limits table for throttling /api/tracks/generate.
-- Keyed by "user:<userId>" for authenticated requests, "ip:<sha256>" for
-- anonymous traffic. The route counts rows in the trailing hour for the
-- identifier; if over the configured limit, returns 429 with Retry-After.
--
-- Apply against Neon (or any Postgres) via:
--   psql "$DATABASE_URL" -f scripts/migrations/2026-05-17_add_rate_limits.sql
--
-- Idempotent: safe to re-run.
--
-- Until this migration is applied, the rate-limit check fails open (logs
-- the missing-table error and allows the request) so the route is not
-- broken by the order of deploys.

CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limits_identifier_created_at_idx
  ON rate_limits (identifier, created_at);
