/**
 * NextAuth v5 entry point.
 *
 * This module owns the single NextAuth() call for the app. Routes, server
 * actions, and server components import `auth`, `signIn`, `signOut` from
 * here. The dynamic route at src/app/api/auth/[...nextauth]/route.ts
 * re-exports `handlers.GET` and `handlers.POST`.
 *
 * Behavior without env vars:
 *   - No DATABASE_URL: the Drizzle adapter is not attached. JWT sessions
 *     still work; user-scoped DB reads in the JWT callback are skipped.
 *   - No RESEND_API_KEY: the email provider falls back to SMTP env vars
 *     (EMAIL_SERVER_HOST/PORT/USER/PASSWORD). Without those, sign-in attempts
 *     will fail at send time, not at boot.
 *
 * No env-var read at this module's top level throws. Importing this file is
 * safe at build time on Vercel without any auth config set.
 */

import NextAuth, { type NextAuthConfig } from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import Google from 'next-auth/providers/google';
import type { JWT } from 'next-auth/jwt';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { SubscriptionStatus } from '@/types';
import { getDb, users, accounts, sessions, verificationTokens } from '@/lib/db';

// Reference JWT so TS keeps the module-augmentation site below valid under
// moduleResolution=bundler. Without an import, the declare-module block
// triggers TS2664 (module not found in augmentation).
type _JwtBridge = JWT;

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      subscriptionStatus: SubscriptionStatus;
      stripeCustomerId: string | null;
    };
  }
  interface User {
    subscriptionStatus?: SubscriptionStatus;
    stripeCustomerId?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    subscriptionStatus: SubscriptionStatus;
    stripeCustomerId: string | null;
  }
}

function buildAuthConfig(): NextAuthConfig {
  let adapter: NextAuthConfig['adapter'] | undefined;

  if (process.env.DATABASE_URL) {
    try {
      // `@/lib/db` is import-safe: getDb() is lazy and only throws if called
      // without DATABASE_URL, which we guard above. So a static import here
      // does not read env at module load and stays build-safe on Vercel.
      //
      // The adapter MUST receive our table mapping. Called with only the db,
      // it falls back to its built-in default schema, whose singular table
      // names (`user`, `account`, `session`, `verificationToken`) do not
      // exist in this database — our tables are plural (`users`, `accounts`,
      // …). That fallback made every OAuth callback throw on
      // `getUserByAccount`/`createUser`, surfacing as the Auth.js
      // "Configuration" error right after Google sign-in.
      //
      // The cast is required because @auth/drizzle-adapter types its schema
      // arg to its own default column shape (it expects `emailVerified`/
      // `image` on users and snake_case token columns on accounts). Our
      // tables diverge, but every column the adapter actually reads/writes
      // for the JWT-session + Google/email flows (id, email, name, provider,
      // providerAccountId, userId, sessionToken, identifier, token, expires)
      // exists; extra/renamed columns are ignored by Drizzle's `.values()`.
      adapter = DrizzleAdapter(getDb(), {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } catch (err) {
      console.warn('[auth] Could not initialize Drizzle adapter:', err);
    }
  }

  const nodemailerProvider = Nodemailer({
    server: {
      host: process.env.EMAIL_SERVER_HOST ?? '',
      port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
      auth: {
        user: process.env.EMAIL_SERVER_USER ?? '',
        pass: process.env.EMAIL_SERVER_PASSWORD ?? '',
      },
    },
    from: process.env.EMAIL_FROM ?? 'Cue Track <noreply@cuetrack.app>',
    ...(process.env.RESEND_API_KEY
      ? {
          sendVerificationRequest: async ({ identifier: email, url }) => {
            const { Resend } = await import('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
              from: process.env.EMAIL_FROM ?? 'Cue Track <noreply@cuetrack.app>',
              to: email,
              subject: 'Sign in to Cue Track',
              html: `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;"><h2>Sign in to Cue Track</h2><p>Click the link below to sign in to your account:</p><a href="${url}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Sign In</a><p style="color: #6b7280; margin-top: 16px; font-size: 14px;">If you did not request this email, you can safely ignore it.</p></div>`,
            });
          },
        }
      : {}),
  });

  const providers: NextAuthConfig['providers'] = [nodemailerProvider];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Google verifies email ownership, so linking a Google sign-in to an
        // existing user with the same email is safe here — and desirable: a
        // Pro buyer whose users row was created by the Stripe webhook (keyed
        // by email) gets that same row + active subscription on first sign-in.
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  return {
    ...(adapter ? { adapter } : {}),
    // Vercel serves this app behind its edge proxy and via generated
    // *.vercel.app aliases, so the request host is not the canonical origin.
    // Trust it explicitly rather than relying on Auth.js's `VERCEL` env
    // auto-detection, which otherwise throws `UntrustedHost` (a
    // "Configuration" error) on the OAuth callback.
    trustHost: true,
    session: { strategy: 'jwt' },
    providers,
    pages: {
      signIn: '/auth/signin',
      verifyRequest: '/auth/verify',
      error: '/auth/error',
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id as string;
          token.subscriptionStatus =
            ((user as Record<string, unknown>).subscriptionStatus as SubscriptionStatus) ?? 'none';
          token.stripeCustomerId =
            ((user as Record<string, unknown>).stripeCustomerId as string | null) ?? null;
        }
        if (process.env.DATABASE_URL && token.id) {
          try {
            const { db, users } = await import('@/lib/db');
            const { eq } = await import('drizzle-orm');
            const rows = await db
              .select({
                subscriptionStatus: users.subscriptionStatus,
                stripeCustomerId: users.stripeCustomerId,
              })
              .from(users)
              .where(eq(users.id, token.id))
              .limit(1);
            if (rows.length > 0) {
              token.subscriptionStatus = rows[0].subscriptionStatus;
              token.stripeCustomerId = rows[0].stripeCustomerId;
            }
          } catch {
            // Continue with stale token if DB read fails.
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.id;
          session.user.subscriptionStatus = token.subscriptionStatus ?? 'none';
          session.user.stripeCustomerId = token.stripeCustomerId ?? null;
        }
        return session;
      },
    },
    // Accept either env name. Auth.js v5 standardized on AUTH_SECRET; this
    // project's docs/.env use NEXTAUTH_SECRET. Reading both means a missing
    // (or differently-named) value can't silently degrade to no secret and
    // produce the "Configuration" error on sign-in.
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(buildAuthConfig());
