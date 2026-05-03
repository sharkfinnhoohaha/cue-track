import { NextRequest, NextResponse } from 'next/server';
import type { ApiError, PlanId } from '@/types';

const PRICES: Record<PlanId, { amountCents: number; mode: 'payment' | 'subscription'; label: string }> = {
  single: { amountCents: 300, mode: 'payment', label: 'Single Track Download' },
  pro: { amountCents: 1900, mode: 'subscription', label: 'Cue Track Pro (Monthly)' },
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json<ApiError>({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json<ApiError>({ error: 'Request body must be a JSON object' }, { status: 400 });
  }

  const { trackId, email, plan } = body as { trackId?: string; email?: string; plan?: string };

  if (!plan || !['single', 'pro'].includes(plan)) {
    return NextResponse.json<ApiError>({ error: 'plan is required and must be "single" or "pro"' }, { status: 400 });
  }

  if (plan === 'single' && (!trackId || typeof trackId !== 'string')) {
    return NextResponse.json<ApiError>({ error: 'trackId is required for single-track purchases' }, { status: 400 });
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json<ApiError>({ error: 'A valid email address is required' }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[stripe/checkout] STRIPE_SECRET_KEY not set -- returning demo URL');
    return NextResponse.json({
      sessionUrl: `/checkout/demo?plan=${plan}&trackId=${trackId ?? ''}&email=${encodeURIComponent(email)}`,
      demo: true,
    });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

    const planId = plan as PlanId;
    const pricing = PRICES[planId];
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const successUrl = trackId
      ? `${origin}/tracks/${trackId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = trackId
      ? `${origin}/tracks/${trackId}?checkout=canceled`
      : `${origin}/pricing?checkout=canceled`;

    const priceId = plan === 'pro' ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_SINGLE_PRICE_ID;

    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            unit_amount: pricing.amountCents,
            product_data: { name: pricing.label },
            ...(pricing.mode === 'subscription' ? { recurring: { interval: 'month' as const } } : {}),
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      mode: pricing.mode,
      customer_email: email,
      line_items: [lineItem],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { plan: planId, ...(trackId ? { trackId } : {}) },
    });

    return NextResponse.json({ sessionUrl: session.url });
  } catch (stripeErr) {
    console.error('[stripe/checkout] Stripe session creation failed:', stripeErr);
    return NextResponse.json<ApiError>(
      { error: 'Failed to create checkout session', details: stripeErr instanceof Error ? stripeErr.message : 'Unknown Stripe error' },
      { status: 500 },
    );
  }
}
