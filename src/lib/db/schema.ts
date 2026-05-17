import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  pgEnum,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import type { SongSpec } from '@/types';

/**
 * Drizzle custom type for Postgres `bytea`. The Neon HTTP driver returns
 * bytea values as either Buffer/Uint8Array or as the Postgres wire-format
 * hex string `\x...`; downstream consumers normalize that in
 * src/lib/audio/tts.ts. Drizzle just needs to know how to declare the
 * column type in DDL and how to type the value at compile time.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// --- Enums ---

export const trackStatusEnum = pgEnum('track_status', ['rendering', 'ready', 'failed']);
export const purchaseStatusEnum = pgEnum('purchase_status', ['pending', 'paid', 'refunded']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'none',
  'active',
  'past_due',
  'canceled',
]);

export const analyzeJobStatusEnum = pgEnum('analyze_job_status', [
  'queued',
  'running',
  'done',
  'failed',
]);

export const analyzeMethodEnum = pgEnum('analyze_method', [
  'template',
  'foote',
  'ml',
]);

// --- Tables ---

export const tracks = pgTable('tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  spec: jsonb('spec').$type<SongSpec>().notNull(),
  status: trackStatusEnum('status').notNull().default('rendering'),
  previewUrl: text('preview_url'),
  fullUrl: text('full_url'),
  duration: integer('duration'), // seconds, nullable until rendered
  email: text('email'),          // guest checkout email
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  trackId: uuid('track_id')
    .notNull()
    .references(() => tracks.id, { onDelete: 'cascade' }),
  stripeSessionId: text('stripe_session_id').notNull().unique(),
  stripePaymentIntent: text('stripe_payment_intent'),
  status: purchaseStatusEnum('status').notNull().default('pending'),
  email: text('email').notNull(),
  amountCents: integer('amount_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('none'),
  subscriptionId: text('subscription_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const presets = pgTable('presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  spec: jsonb('spec').$type<SongSpec>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- NextAuth Tables ---

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionToken: text('session_token').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

// --- Rate limiting ---

/**
 * Throttle attempts at /api/tracks/generate. Each successful request appends
 * one row keyed by an identifier: "user:<userId>" for authenticated users,
 * "ip:<sha256(salt+ip)>" for anonymous traffic. The rate-limit check counts
 * rows in the trailing hour for the identifier.
 *
 * Migration: scripts/migrations/2026-05-17_add_rate_limits.sql
 *
 * Storage grows with traffic; an off-hours cleanup job (delete rows older
 * than 24h) is a P1 follow-up.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    identifierCreatedAtIdx: index('rate_limits_identifier_created_at_idx').on(
      table.identifier,
      table.createdAt,
    ),
  }),
);

// --- Upload analysis quota ---

/**
 * Append-only log of /api/tracks/analyze requests, used to enforce the
 * "1 free upload analysis per anon, then paywall" rule from the V1 funnel.
 *
 * Identifier scheme parallels rate_limits:
 *   "user:<userId>"  for authenticated callers
 *   "ip:<sha256(salt+ip)>"  for anonymous callers
 *
 * Quota check: count rows for the identifier (and the user's current IP
 * for auth callers, so signup does not reset the cap). If >= the per-tier
 * cap and the caller is not a Pro subscriber, return 402.
 *
 * Distinct from rate_limits because the lifetime semantics differ: rate
 * limits roll on a 1-hour window and are cleaned up daily, while upload
 * quota is lifetime-cumulative for the free tier and should not be
 * touched by the existing cron. A separate cleanup policy (e.g. "keep
 * 90 days of paid history for analytics, anon entries forever") can land
 * on this table without affecting the rate-limit cron.
 */
export const uploadAnalyses = pgTable(
  'upload_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    trackId: uuid('track_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    identifierIdx: index('upload_analyses_identifier_idx').on(table.identifier),
  }),
);

// --- TTS caching ---

/**
 * Persistent Google Cloud TTS output, keyed by "{voiceId}:{sha256(text)}".
 * Read/written by src/lib/audio/tts.ts and services/audio-worker/lib/
 * audio/tts.ts on cue synthesis. Without this table the in-process Map
 * evaporates on every cold start and TTS cost scales with traffic instead
 * of with unique cue strings.
 *
 * audio: raw little-endian Float32 PCM at sample_rate Hz.
 *
 * The audio engine uses raw SQL via the neon HTTP client to read/write
 * this table (not Drizzle's query builder), so this definition exists
 * primarily so that `drizzle-kit push` provisions the table on fresh
 * databases and so that other future Drizzle consumers have a typed
 * reference.
 *
 * Migration: scripts/migrations/2026-05-17b_add_tts_cache.sql
 */
export const ttsCache = pgTable('tts_cache', {
  cacheKey: text('cache_key').primaryKey(),
  audio: bytea('audio').notNull(),
  sampleRate: integer('sample_rate').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Async analyze jobs (Phase D) ---

/**
 * Async pipeline for /api/tracks/analyze. The Vercel route inserts a row
 * here at status='queued' and returns 202 + jobId, then runs the actual
 * worker call in the background via @vercel/functions' waitUntil. The
 * client polls GET /api/tracks/analyze/jobs/[id] until status='done' or
 * 'failed' and reads the resulting trackId from result.
 *
 * Why async: the ML-Python worker (PR-C) has a 30-60s cold start that
 * can exceed Vercel's 60s function timeout when added to inference time.
 * The Foote and template paths complete in seconds, but go through the
 * same pipeline for consistency.
 *
 * Identifier scheme mirrors rate_limits / upload_analyses. GET on this
 * table is guarded by the same identifier so callers only see their own
 * jobs.
 *
 * result jsonb shape (when status='done'):
 *   { trackId, bpm, duration, sampleRate, suggestedSections, method }
 *
 * No migration file; created via drizzle-kit push together with
 * upload_analyses (Phase C) and analyze_outcomes (Phase D PR-D).
 */
export interface AnalyzeJobResult {
  trackId: string;
  bpm: number;
  duration: number;
  sampleRate: number;
  suggestedSections: Array<{ id: string; name: string; bars: number }>;
  method: 'template' | 'foote' | 'ml';
}

export const analyzeJobs = pgTable(
  'analyze_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    method: analyzeMethodEnum('method').notNull(),
    status: analyzeJobStatusEnum('status').notNull().default('queued'),
    audioSizeBytes: integer('audio_size_bytes').notNull(),
    mime: text('mime').notNull(),
    title: text('title').notNull(),
    result: jsonb('result').$type<AnalyzeJobResult>(),
    errorText: text('error_text'),
    trackId: uuid('track_id').references(() => tracks.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => ({
    identifierStatusIdx: index('analyze_jobs_identifier_status_idx').on(
      table.identifier,
      table.status,
    ),
  }),
);

// --- Inferred types ---

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Preset = typeof presets.$inferSelect;
export type NewPreset = typeof presets.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;

export type AnalyzeJob = typeof analyzeJobs.$inferSelect;
export type NewAnalyzeJob = typeof analyzeJobs.$inferInsert;

export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;

export type UploadAnalysis = typeof uploadAnalyses.$inferSelect;
export type NewUploadAnalysis = typeof uploadAnalyses.$inferInsert;

export type TtsCacheRow = typeof ttsCache.$inferSelect;
export type NewTtsCacheRow = typeof ttsCache.$inferInsert;
