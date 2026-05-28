# CLAUDE.md

Project context for Claude Code sessions. Engineering conventions, gotchas, and a map of the analyze pipeline.

For deployment / env-var setup, see `HANDOFF.md`. For product framing, see `DESIGN_BRIEF.md`.

## What this app is

Cue Track turns an uploaded song into an in-ear-monitor click track with voiced section cues (Intro / Verse / Chorus / …). The user uploads audio, the analyzer detects BPM and section structure, the user reviews the suggested spec on `/tracks/[id]/review`, and `/api/tracks/generate` renders the final WAV/MP3.

## Stack

- **Frontend + API**: Next.js 14 App Router on Vercel (Node serverless runtime)
- **DB**: Neon Postgres via `@neondatabase/serverless` + Drizzle ORM (`src/lib/db/schema.ts`)
- **Auth**: NextAuth.js (`src/auth.ts`)
- **Storage**: Vercel Blob for source uploads; GCS bucket for rendered tracks (worker-side)
- **Audio worker**: Node service in `services/audio-worker/` (Cloud Run). Decodes MP3/WAV, runs music-tempo for BPM, runs Foote novelty for section boundaries.
- **ML worker**: Python FastAPI service in `services/ml-worker/` (Cloud Run, optional). allin1-backed section detector behind an A/B router (`src/lib/analyze-router.ts`).
- **Payments**: Stripe (test mode in V1; flip-to-live checklist in `HANDOFF.md`)
- **Observability**: Sentry (DSN-gated; silent no-op when unset)

## Hard infra constraints (these bit us, read first)

- **Vercel serverless body cap is 4.5 MB at the edge.** It 413s *before* the route handler runs, so per-route size caps are unreachable for the request body. Any user-uploaded audio must go through Vercel Blob, not multipart to a Next.js route.
- **Vercel function `maxDuration`**: `/api/tracks/analyze` is 300s; `/api/tracks/generate` is 60s. Analyze is async (enqueue + poll) so the 202 returns fast, but the `waitUntil(runAnalyzeJob)` background work is still bounded by this route's `maxDuration`, not exempt from it. It was 60s, which killed real-song analysis (worker cold start + round trip, or in-process decode of a multi-minute song) mid-run and stranded the job in `running`; raised to 300s. The internal `WORKER_TIMEOUT_MS` (90s) + in-process fallback now both fit inside the budget. Keep the client poll ceiling (`upload-form.tsx`) and the poll route's stale-job threshold above this value.
- **`@vercel/blob` requires Node ≥20.** `package.json` declares `engines.node >=20`; the Vercel dashboard must match.
- **Cloud Run audio worker has a 32 MB request body cap** and a default 60s request timeout. The Vercel-side `WORKER_TIMEOUT_MS` is 90s to cover the ML cold-start case.

## The analyze pipeline (end-to-end)

This is the most-touched path in the app. The flow has three async hops:

```
browser ──upload()──► Vercel Blob ──blobUrl──► /api/tracks/analyze
                                                        │
                                          waitUntil(runAnalyzeJob)
                                                        ▼
                              Cloud Run worker /analyze/foote (or /analyze on ML)
                                                        │
                              DB: analyze_jobs done + tracks row inserted, blob deleted
                                                        ▲
browser ──poll /api/tracks/analyze/jobs/[id]────────────┘
```

Files:

- `src/components/upload-form.tsx` — client. Calls `upload()` from `@vercel/blob/client`, then POSTs `{ blobUrl, contentType, filename, size }` to `/api/tracks/analyze`, then polls the returned `statusUrl`.
- `src/app/api/tracks/analyze/upload/route.ts` — token broker for Vercel Blob client uploads. Auth + identifier check; signs an upload token scoped to the audio MIME allowlist (`audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/wave`, `audio/vnd.wave`) and 150 MB max.
- `src/app/api/tracks/analyze/route.ts` — enqueue endpoint. Validates blob URL host (must be `*.blob.vercel-storage.com`), runs rate-limit + quota checks, inserts an `analyze_jobs` row, and kicks off `runAnalyzeJob` via `waitUntil`. The worker is optional: when `AUDIO_WORKER_URL`/secret are unset it enqueues with `method: 'template'` (in-process) instead of 503-ing.
- `src/lib/analyze-jobs.ts` — background runner. Atomically claims the job (`queued`→`running`), runs the detector, builds the `SongSpec`, inserts the draft `tracks` row, marks the job `done`. Deletes the blob in a `finally` so success and failure both clean up. **Worker is optional and resilient:** when configured + healthy it sends `{ blobUrl, mime }` JSON and the worker fetches the blob itself (bypasses Cloud Run's 32 MB body cap). When the worker is unset, or a configured worker is *unreachable* (network/DNS/timeout, 5xx, 401/403 — surfaced as `WorkerInfraError`), the runner downloads the blob and analyzes in-process via `src/lib/audio/analyze.ts`. Only a genuine bad-file error (decode/415/422) fails the job, since the in-process decoder would reject the same bytes.
- `src/lib/audio/analyze.ts` — in-process detector (port of the worker's `analyze.ts`): decode MP3/WAV, music-tempo BPM, duration-banded section template. The worker-free fallback for the analyze pipeline, mirroring how `/api/tracks/generate` falls back to in-process rendering.
- `src/app/api/health/worker/route.ts` — diagnostic. Reports whether `AUDIO_WORKER_URL`/`ML_WORKER_URL` are set and pings their `/health`. Use it to tell "worker unreachable" apart from "worker unset" instead of inferring from a generic UI error.
- `src/app/api/tracks/analyze/jobs/[id]/route.ts` — poll endpoint. Returns `{ status, result, error }`. Identifier guard returns 404 (not 403) for jobs the caller didn't enqueue.
- `src/lib/analyze-router.ts` — picks `template | foote | ml` per caller-stable hash (`ANALYZE_AB_SPLIT_PERCENT`). ML disabled by default; falls back to Foote when `ML_WORKER_URL` is unset.

Why three hops instead of one:
- **Blob upload first** because Vercel's 4.5 MB body cap kills direct multipart uploads.
- **Async job** so the POST returns a 202 immediately instead of holding the request open for the whole analysis. Note the background runner is still bounded by the route's `maxDuration` (300s); the poll route fails a job that outlives that budget so a killed runner can't strand the client.
- **Quota + rate-limit on `/analyze` (not `/analyze/upload`)** so an unused upload token doesn't burn the user's free analysis. The blob still gets cleaned up by `runAnalyzeJob`'s `finally`.

Idempotency: the runner uses a conditional UPDATE (`WHERE status='queued'`) to claim the job, so a duplicate dispatch on function restart sees `status != 'queued'` and exits without double-processing.

## Other API routes worth knowing

- `/api/tracks/generate` (`src/app/api/tracks/generate/route.ts`) — finalizes a draft track. Renders in-process for short tracks; offloads to the Cloud Run worker via `/render` when `AUDIO_WORKER_URL` is set and duration ≥ `AUDIO_WORKER_THRESHOLD_SECONDS` (default 240).
- `/api/tracks/[id]/download/route.ts` — re-renders on demand from the persisted SongSpec. Same offload logic.
- `/api/stripe/webhook` — handles `checkout.session.completed`, `customer.subscription.*`. Idempotency via Stripe event ID.
- `/api/cron/cleanup-rate-limits` — 24h-tail cleanup of the `rate_limits` table.

## DB schema notes

`src/lib/db/schema.ts` is the source of truth. Notable tables:

- `tracks` — finalized + draft tracks. `status` enum: `rendering | ready | failed`. Drafts created by `runAnalyzeJob` start at `rendering`; `/api/tracks/generate` flips to `ready`.
- `analyze_jobs` — Phase D async pipeline. Identifier scheme mirrors `rate_limits` / `upload_analyses`: `user:<userId>` for auth, `ip:<sha256(salt+ip)>` for anon.
- `rate_limits`, `upload_analyses` — distinct lifetimes: `rate_limits` is a rolling 1-hour window cleaned daily; `upload_analyses` is cumulative for the free-tier paywall.
- `tts_cache` — persistent Google TTS bytea keyed by `{voiceId}:{sha256(text)}`. Read/written from raw SQL in `src/lib/audio/tts.ts`, not Drizzle's query builder.
- `analyze_outcomes` — A/B detector measurement. Written best-effort by `/api/tracks/generate`'s UPDATE path.

Migrations live in `scripts/migrations/`. New tables (`analyze_jobs`, `upload_analyses`, `analyze_outcomes`) ship via `npx drizzle-kit push` rather than hand-written SQL.

## Conventions and pitfalls

- **Tests**: `npx vitest run`. 114 tests across the API routes and lib code. New API routes should mock `@/lib/db`, `@/auth`, and `@vercel/functions` waitUntil rather than hitting real services.
- **Typecheck**: `npx tsc --noEmit`. Must be clean before pushing.
- **Build**: `npx next build`. The Sentry plugin wraps `next.config.mjs`; build is unaffected when `SENTRY_AUTH_TOKEN` is unset.
- **lint**: ESLint is not configured (`npx next lint` prompts). Don't run lint as a gate.
- **Commit style**: lowercase imperative with scoped prefix: `fix(upload): …`, `feat(api/tracks/analyze): …`, `chore: …`. See `git log` for the established pattern.
- **Don't 6924814-bait**: `Audio worker error` is a string from the pre-async analyze route (`6924814`). It can't be produced by the current pipeline. If you see it, the deployed bundle is stale.
- **Don't bypass the blob host check.** `src/app/api/tracks/analyze/route.ts:isAllowedBlobUrl` restricts the server-side fetch to `*.blob.vercel-storage.com`. Removing this turns the route into an SSRF gadget.
- **Don't expose `WORKER_SHARED_SECRET` to the browser.** The worker is reachable from anyone with the secret; the Vercel side is the only authorized caller. Client → worker uploads must go through Vercel Blob, not direct POSTs.

## Environment

Required for the analyze flow:

- `DATABASE_URL` — Neon pooled connection string
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob (Storage → Create → Blob in the dashboard)
- `RATE_LIMIT_IP_SALT` — salt for anon IP hashing
- Optional: `AUDIO_WORKER_URL` + `AUDIO_WORKER_SHARED_SECRET` — Cloud Run audio worker. **Not required:** when unset (or unreachable), analysis runs in-process via `src/lib/audio/analyze.ts`. Wire it only to get the Foote detector or to offload heavy work off the Vercel function.
- Optional: `ML_WORKER_URL` + `ML_WORKER_SHARED_SECRET`, `ANALYZE_AB_SPLIT_PERCENT`

Full list with descriptions in `.env.local.example`.
