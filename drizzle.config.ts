import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for schema introspection and DB sync.
 *
 * Workflow:
 *   1. Bootstrap a fresh DB:    npx drizzle-kit push
 *   2. Generate migration SQL:  npx drizzle-kit generate
 *   3. Apply generated SQL:     npx drizzle-kit migrate
 *
 * Schema source of truth is src/lib/db/schema.ts. The hand-written
 * migrations in scripts/migrations/ document specific operator changes
 * (rate_limits, tts_cache) but are not required when drizzle-kit push
 * is used on a fresh database; push reads schema.ts and provisions all
 * tables in one shot.
 *
 * Set DATABASE_URL in your shell (vercel env pull) before running.
 */
export default {
  schema: './src/lib/db/schema.ts',
  out: './scripts/migrations/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
