import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { signIn, auth } from '@/auth';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Cue Track to manage your tracks and subscription.',
};

// Only accept same-origin relative paths so this can't be used as an open
// redirect. Anything starting with `//` is also rejected (protocol-relative).
function safeCallback(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '/dashboard';
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string | string[] };
}) {
  const callbackUrl = safeCallback(searchParams.callbackUrl);

  // Already signed in? Don't show the form — send them where they were headed
  // (e.g. /create, /pricing, /dashboard). Keeps the new nav "Sign in" link and
  // the manual-mode sign-up round-trip from dead-ending on a pointless form.
  const session = await auth();
  if (session?.user?.id) {
    redirect(callbackUrl);
  }
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const emailEnabled = Boolean(
    process.env.RESEND_API_KEY || process.env.EMAIL_SERVER_HOST,
  );

  async function googleSignIn(): Promise<void> {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  async function emailSignIn(formData: FormData): Promise<void> {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    if (!email || !email.includes('@')) return;
    await signIn('nodemailer', { email, redirectTo: callbackUrl });
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#1d1d1f] sm:text-5xl">
            Sign in
          </h1>
          <p className="mt-3 text-muted text-lg leading-relaxed">
            Sign in to manage your tracks and subscription.
          </p>
        </div>

        {googleEnabled && (
          <form action={googleSignIn}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-black/[.13] bg-white px-4 py-3 text-sm font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
                <path
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                  fill="#34A853"
                />
                <path
                  d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
          </form>
        )}

        {googleEnabled && emailEnabled && (
          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted">
            <span className="h-px flex-1 bg-black/[.08]" />
            or
            <span className="h-px flex-1 bg-black/[.08]" />
          </div>
        )}

        {emailEnabled && (
          <form action={emailSignIn} className="flex flex-col gap-4">
            <label className="text-sm text-muted" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="input px-4 py-3"
            />
            <button
              type="submit"
              className="w-full btn btn-primary rounded-lg py-3 text-sm font-semibold"
            >
              Send sign-in link
            </button>
          </form>
        )}

        {!googleEnabled && !emailEnabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Sign-in is not configured for this deployment yet. Set
            <code className="mx-1 font-mono">GOOGLE_CLIENT_ID</code> +
            <code className="mx-1 font-mono">GOOGLE_CLIENT_SECRET</code>, or an
            email provider, to enable sign-in.
          </div>
        )}

        <p className="mt-6 text-sm text-muted/70">
          Buying a single track does not require an account. Sign in is needed
          for Pro subscriptions and unlimited uploads.
        </p>
      </main>
      <Footer />
    </>
  );
}
