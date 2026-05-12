import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Sign-in error',
  description: 'Something went wrong while signing you in.',
};

const ERROR_COPY: Record<string, string> = {
  Configuration: 'Authentication is not configured correctly on the server.',
  AccessDenied: 'You do not have permission to sign in.',
  Verification: 'The sign-in link has expired or has already been used.',
  Default: 'Something went wrong. Please try again.',
};

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const code = searchParams?.error ?? 'Default';
  const message = ERROR_COPY[code] ?? ERROR_COPY.Default;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F0EDE6] sm:text-5xl">
            Sign-in error
          </h1>
          <p className="mt-3 text-muted text-lg leading-relaxed">{message}</p>
        </div>

        <Link
          href="/auth/signin"
          className="inline-flex items-center rounded-md bg-[#C8A250] px-4 py-3 font-medium text-black transition hover:bg-[#d4b46c]"
        >
          Try signing in again
        </Link>
      </main>
      <Footer />
    </>
  );
}
