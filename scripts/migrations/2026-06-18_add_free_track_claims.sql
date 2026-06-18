-- Free-track onboarding offer: one free cue track per caller.
--
-- `identifier` mirrors rate_limits / upload_analyses: `user:<id>` for authed
-- callers, `ip:<sha256(salt+ip)>` for anonymous ones. The UNIQUE constraint
-- enforces "one free track ever" per identifier. Access to the claimed track
-- is via the emailed signed download token, so this table never grants access
-- on its own and free claims never touch the revenue-bearing purchases table.
--
-- Ships via `npx drizzle-kit push` like the other Phase-D tables; this file
-- documents the equivalent DDL.

CREATE TABLE IF NOT EXISTS free_track_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  text NOT NULL UNIQUE,
  track_id    uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
