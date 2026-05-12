import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { signIn } from '@/auth';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Cue Track with an email magic link.',
};

export default function SignInPage() {
  async function emailSignIn(formData: FormData): Promise<void> {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    if (!email || !email.includes('@')) return;
    await signIn('nodemailer', { email, redirectTo: '/dashboard' });
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F0EDE6] sm:text-5xl">
            Sign in
          </h1>
          <p className="mt-3 text-muted text-lg leading-relaxed">
            Enter your email and we will send you a sign-in link.
          </p>
        </div>

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
            className="w-full rounded-md border border-white/10 bg-black/30 px-4 py-3 text-[#F0EDE6] placeholder:text-muted/50 focus:border-[#C8A250] focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-[#C8A250] px-4 py-3 font-medium text-black transition hover:bg-[#d4b46c]"
          >
            Send sign-in link
          </button>
        </form>

        <p className="mt-6 text-sm text-muted/70">
          Buying a single track does not require an account. Sign in is only
          needed for Pro subscriptions and saved presets.
        </p>
      </main>
      <Footer />
    </>
  );
}
