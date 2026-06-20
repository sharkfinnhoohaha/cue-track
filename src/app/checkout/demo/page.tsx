import Link from 'next/link';
import type { Metadata } from 'next';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Demo checkout',
  robots: { index: false, follow: false },
};

/**
 * Stand-in for Stripe Checkout when payments are not configured on this
 * deployment. `/api/stripe/checkout` returns `{ demo: true, sessionUrl:
 * "/checkout/demo?..." }` when STRIPE_SECRET_KEY is unset, and the client
 * redirects here. Without this page that redirect 404s; this explains the
 * demo state and links the user back instead of dead-ending.
 */
export default function DemoCheckoutPage({
  searchParams,
}: {
  searchParams: { plan?: string; trackId?: string };
}) {
  const plan = searchParams?.plan === 'pro' ? 'pro' : 'single';
  const trackId =
    typeof searchParams?.trackId === 'string' ? searchParams.trackId : '';
  const backHref = plan === 'pro' || !trackId ? '/pricing' : `/tracks/${trackId}`;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-md px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="rounded-2xl border border-white/[.08] bg-white p-8 text-center">
          <p className="font-mono text-[11px] tracking-[.12em] uppercase text-zinc-400 mb-3">
            Demo mode
          </p>
          <h1 className="font-display font-bold tracking-[-0.02em] text-zinc-100 text-[22px] mb-3">
            Payments aren&apos;t configured here
          </h1>
          <p className="text-[14px] text-zinc-400 leading-[1.6] mb-7">
            This deployment doesn&apos;t have Stripe keys set, so checkout for the{' '}
            <span className="font-medium text-zinc-100">
              {plan === 'pro' ? 'Pro subscription' : 'single track'}
            </span>{' '}
            can&apos;t run. On the production site this is where Stripe Checkout
            would open. Previews are still free to play.
          </p>
          <Link
            href={backHref}
            className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-[14px] font-bold text-zinc-950 hover:opacity-90 transition-opacity"
          >
            ← Go back
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
