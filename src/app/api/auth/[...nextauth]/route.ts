import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { SubscriptionStatus } from '@/types';

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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { db } = require('@/lib/db') as { db: Parameters<typeof DrizzleAdapter>[0] };
      adapter = DrizzleAdapter(db);
    } catch (err) {
      console.warn('[auth] Could not initialize Drizzle adapter:', err);
    }
  }

  const config: NextAuthConfig = {
    ...(adapter ? { adapter } : {}),

    session: {
      strategy: 'jwt',
    },

    providers: [
      EmailProvider({
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
                  html: `
                    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                      <h2>Sign in to Cue Track</h2>
                      <p>Click the link below to sign in to your account:</p>
                      <a href="${url}" style="
                        display: inline-block;
                        padding: 12px 24px;
                        background: #2563eb;
                        color: #fff;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: 600;
                      ">Sign In</a>
                      <p style="color: #6b7280; margin-top: 16px; font-size: 14px;">
                        If you did not request this email, you can safely ignore it.
                      </p>
                    </div>
                  `,
                });
              },
            }
          : {}),
      }),
    ],

    pages: {
      signIn: '/auth/signin',
      verifyRequest: '/auth/verify',
      error: '/auth/error',
    },

    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id as string;
          token.subscriptionStatus = (user as Record<string, unknown>).subscriptionStatus as SubscriptionStatus ?? 'none';
          token.stripeCustomerId = (user as Record<string, unknown>).stripeCustomerId as string | null ?? null;
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
            // Silently continue with stale token data
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

    secret: process.env.NEXTAUTH_SECRET,
  };

  return config;
}

const authConfig = buildAuthConfig();
const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };
