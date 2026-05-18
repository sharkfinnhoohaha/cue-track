-- 2026-05-17d_add_analyze_outcomes.sql
--
-- Adds the analyze_outcomes table for Phase D A/B detector scoring.
--
-- One row per finalized track. Captures the detector's suggestion at
-- INSERT time (snapshot) and the user's finalized spec at UPDATE time
-- (final_sections), with three computed deltas:
--   num_sections_delta = |final.length - snapshot.length|
--   total_bars_delta  = sum |final[i].bars - snapshot[i].bars|
--   name_edit_count   = count of indices where the name was changed
--
-- The /api/tracks/generate UPDATE path writes here best-effort; a
-- failure logs but does not fail the user's finalization request.
--
-- Score after ~100 finalized tracks per method:
--   SELECT method, count(*) AS n,
--          avg(total_bars_delta) AS avg_bar_delta,
--          percentile_cont(0.5) WITHIN GROUP (ORDER BY total_bars_delta) AS median_bar_delta
--   FROM analyze_outcomes
--   GROUP BY method
--   ORDER BY avg_bar_delta ASC;
--
-- Lower deltas = better detector. Promote winner by setting
-- ANALYZE_AB_SPLIT_PERCENT on Vercel: 100 for ML, 0 for Foote.
--
-- Apply against Neon via:
--   psql "$DATABASE_URL" -f scripts/migrations/2026-05-17d_add_analyze_outcomes.sql
--
-- Or apply all current schema additions in one shot via:
--   npx drizzle-kit push
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS analyze_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  job_id uuid REFERENCES analyze_jobs(id) ON DELETE SET NULL,
  method analyze_method NOT NULL,
  snapshot jsonb NOT NULL,
  final_sections jsonb NOT NULL,
  num_sections_delta integer NOT NULL,
  total_bars_delta integer NOT NULL,
  name_edit_count integer NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analyze_outcomes_method_computed_at_idx
  ON analyze_outcomes (method, computed_at);
