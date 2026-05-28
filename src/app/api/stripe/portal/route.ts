import { NextRequest, NextResponse } from 'next/server';
import type { ApiError } from '@/types';

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json<ApiError>({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json<ApiError>({ error: 'Request body must be a JSON object' }, { status: 400 });
  }

  const { customerId } = body as { customerId?: string };

  if (!customerId || typeof customerId !== 'string') {
    return NextResponse.json<ApiError>({ error: 'customerId is required' }, { status: 400 });
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
