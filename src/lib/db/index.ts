import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Re-export schema for convenience
export * from './schema';

function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return drizzle(neon(process.env.DATABASE_URL), { schema });
}

export type DB = ReturnType<typeof createDb>;

let _db: DB | undefined;

/**
 * Returns a cached db instance. Throws if DATABASE_URL is missing at call
 * time — not at module load time, so Next.js build succeeds without the var.
 */
export function getDb(): DB {
  if (!_db) _db = createDb();
  return _db;
}

/**
 * Proxy-based lazy export for backwards compatibility.
 * All existing `db.insert(...)`, `db.select(...)`, `db.query.xxx` calls
 * continue to work unchanged; the DATABASE_URL check is deferred to
 * the first actual database operation.
 */
export const db = new Proxy({} as DB, {
  get(_: DB, prop: string | symbol) {
    return Reflect.get(getDb() as object, prop);
  },
});
