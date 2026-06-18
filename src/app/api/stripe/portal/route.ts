import { NextRequest, NextResponse } from 'next/server';
import type { ApiError } from '@/types';
import { auth } from '@/auth';

export async function POST(request: NextRequest) {
  // The Stripe customer is derived from the authenticated session, never from
  // the request body. Trusting a client-supplied customerId would let any
  // caller open another customer's billing portal (view invoices/payment
  // methods, cancel their subscription) — an IDOR on billing data.
  const session = await auth();
  const customerId = session?.user?.stripeCustomerId ?? null;

  if (!session?.user?.id) {
    return NextResponse.json<ApiError>({ error: 'Authentication required' }, { status: 401 });
  }

  if (!customerId) {
    return NextResponse.json<ApiError>(
      { error: 'No billing account found for this user' },
      { status: 404 },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ url: '/dashboard?portal=demo', demo: true });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      request.headers.get('origin') ||
      'http://localhost:3000';
    const portalSession = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/dashboard` });
    return NextResponse.json({ url: portalSession.url });
  } catch (stripeErr) {
    console.error('[stripe/portal] Portal session creation failed:', stripeErr);
    return NextResponse.json<ApiError>(
      { error: 'Failed to create billing portal session', details: stripeErr instanceof Error ? stripeErr.message : 'Unknown Stripe error' },
      { status: 500 },
    );
  }
}
