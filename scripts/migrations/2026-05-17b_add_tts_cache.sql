-- 2026-05-17b_add_tts_cache.sql
--
-- Adds the tts_cache table for persisting Google Cloud Text-to-Speech
-- output between Vercel function cold starts and Cloud Run instance
-- restarts. Without this table, each cold Lambda re-synthesizes the same
-- cue text (e.g. "Verse", "Chorus", "4 bars") and the TTS cost scales
-- with traffic rather than with unique cue strings.
--
-- The audio engine at src/lib/audio/tts.ts and services/audio-worker/
-- lib/audio/tts.ts read this table on cache miss, then write the
-- synthesized PCM bytes back on success. An in-process Map still sits
-- in front of the DB lookup; this table only matters for the cold-start
-- hit, not steady-state.
--
-- cache_key format: "{voiceId}:{sha256(text)}". The hash keeps the key
-- fixed-width and avoids storing raw cue text alongside the audio.
--
-- audio: raw little-endian Float32 PCM at sample_rate Hz. Roughly 35 KB
-- per 200ms cue at 44.1 kHz; a fully warmed cache of 100 cues across 50
-- voices is around 175 MB, well under Neon free-tier storage.
--
-- Apply against Neon (or any Postgres) via:
--   psql "$DATABASE_URL" -f scripts/migrations/2026-05-17b_add_tts_cache.sql
--
-- Idempotent: safe to re-run.
--
-- Until this migration is applied, the audio engine fails soft: the DB
-- read errors out, falls through to the in-process Map miss, then to
-- the live Google TTS call. No user-visible breakage.

CREATE TABLE IF NOT EXISTS tts_cache (
  cache_key text PRIMARY KEY,
  audio bytea NOT NULL,
  sample_rate integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
