import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression guard for the NextAuth wiring in src/auth.ts.
 *
 * The Google sign-in callback was failing with the Auth.js "Configuration"
 * error because the Drizzle adapter was constructed as `DrizzleAdapter(getDb())`
 * — with no table mapping. That makes the adapter fall back to its built-in
 * default schema, whose singular table names (`user`, `account`, …) do not
 * exist in this database (our tables are plural: `users`, `accounts`, …), so
 * every OAuth callback threw on `getUserByAccount`/`createUser`.
 *
 * These tests assert the adapter is given our real tables, and that the
 * config trusts the host (so the callback can't 500 with `UntrustedHost`).
 */

const { mockDrizzleAdapter, mockNextAuth, dbTables } = vi.hoisted(() => ({
  mockDrizzleAdapter: vi.fn((..._args: unknown[]) => ({ __adapter: true })),
  mockNextAuth: vi.fn((..._args: unknown[]) => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
  dbTables: {
    users: { __table: 'users' },
    accounts: { __table: 'accounts' },
    sessions: { __table: 'sessions' },
    verificationTokens: { __table: 'verification_tokens' },
  },
}));

vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: mockDrizzleAdapter }));
vi.mock('next-auth', () => ({ default: mockNextAuth }));
vi.mock('@/lib/db', () => ({
  getDb: () => ({ __db: true }),
  users: dbTables.users,
  accounts: dbTables.accounts,
  sessions: dbTables.sessions,
  verificationTokens: dbTables.verificationTokens,
}));

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.resetModules();
  mockDrizzleAdapter.mockClear();
  mockNextAuth.mockClear();
  process.env.DATABASE_URL = 'postgres://user:pass@localhost/test';
});

afterEach(() => {
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

describe('auth config', () => {
  it('constructs the Drizzle adapter with our actual (plural) table mapping', async () => {
    await import('@/auth');

    expect(mockDrizzleAdapter).toHaveBeenCalledTimes(1);
    const [db, schema] = mockDrizzleAdapter.mock.calls[0];

    expect(db).toBeDefined();
    // The crux of the regression: the schema arg must NOT be omitted, or the
    // adapter silently targets nonexistent default tables.
    expect(schema).toBeDefined();
    expect(schema).toMatchObject({
      usersTable: dbTables.users,
      accountsTable: dbTables.accounts,
      sessionsTable: dbTables.sessions,
      verificationTokensTable: dbTables.verificationTokens,
    });
  });

  it('trusts the host and attaches the adapter', async () => {
    await import('@/auth');

    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    const config = mockNextAuth.mock.calls[0][0] as {
      trustHost?: boolean;
      adapter?: unknown;
      session?: { strategy?: string };
    };

    expect(config.trustHost).toBe(true);
    expect(config.adapter).toBeDefined();
    expect(config.session?.strategy).toBe('jwt');
  });

  it('skips the adapter entirely when DATABASE_URL is unset', async () => {
    delete process.env.DATABASE_URL;
    await import('@/auth');

    expect(mockDrizzleAdapter).not.toHaveBeenCalled();
    const config = mockNextAuth.mock.calls[0][0] as { adapter?: unknown };
    expect(config.adapter).toBeUndefined();
  });
});
