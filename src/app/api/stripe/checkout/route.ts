import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { signDownloadToken } from '@/lib/download-token';
import type { ApiError, PlanId } from '@/types';

// Plan pricing is replicated here as a fallback when Stripe price IDs aren't
// configured (demo / first-boot). When the price ID envs are set we use those
// instead so amounts always match what's in the Stripe Dashboard.
const PRICES: Record<
  PlanId,
  { amountCents: number; mode: 'payment' | 'subscription'; label: string }
> = {
  single: { amountCents: 300, mode: 'payment', label: 'Single Track Download' },
  pro: { amountCents: 1900, mode: 'subscription', label: 'Cue Track Pro (Monthly)' },
};

function resolveOrigin(request: NextRequest): string {
  // Prefer the env-configured origin (matches success/cancel URLs everywhere
  // else in the app) and fall back to the Origin header. NEXT_PUBLIC_BASE_URL
  // is honored for backwards compatibility with older deployments.
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    request.headers.get('origin') ||
    'http://localhost:3000'
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json<ApiError>(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  const { trackId, email: bodyEmail, plan } = body as {
    trackId?: string;
    email?: string;
    plan?: string;
  };

  if (!plan || !['single', 'pro'].includes(plan)) {
    return NextResponse.json<ApiError>(
      { error: 'plan is required and must be "single" or "pro"' },
      { status: 400 },
    );
  }

  if (plan === 'single' && (!trackId || typeof trackId !== 'string')) {
    return NextResponse.json<ApiError>(
      { error: 'trackId is required for single-track purchases' },
      { status: 400 },
    );
  }

  // Pro requires an authenticated session so the resulting subscription can
  // be attached to a known users row (the webhook keys on metadata.userId).
  // Single is anonymous-friendly — Stripe Checkout collects the email itself.
  let sessionUserId: string | null = null;
  let sessionEmail: string | null = null;
  if (plan === 'pro') {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json<ApiError>(
        {
          error: 'Sign in to subscribe to Pro',
          code: 'AUTH_REQUIRED',
        },
        { status: 401 },
      );
    }
    sessionUserId = session.user.id;
    sessionEmail = session.user.email ?? null;
  }

  // Email resolution: Pro uses the signed-in session email; single uses the
  // body email if provided, otherwise lets Stripe Checkout collect it. The
  // webhook reads session.customer_details.email as a fallback so anonymous
  // single purchases still record the buyer's email on the purchases row.
  const email =
    plan === 'pro'
      ? sessionEmail
      : typeof bodyEmail === 'string' && bodyEmail.includes('@')
        ? bodyEmail
        : null;

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[stripe/checkout] STRIPE_SECRET_KEY not set -- returning demo URL');
    return NextResponse.json({
      sessionUrl: `/checkout/demo?plan=${plan}&trackId=${trackId ?? ''}&email=${encodeURIComponent(email ?? '')}`,
      demo: true,
    });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    });

    const planId = plan as PlanId;
    const pricing = PRICES[planId];
    const origin = resolveOrigin(request);

    // For single-track purchases, mint a short-lived download token into the
    // success URL. Stripe only redirects there after payment succeeds, so the
    // buyer can download immediately without waiting on the webhook — and
    // without the track being downloadable by anyone who knows its UUID. The
    // webhook emails a longer-lived token for durable re-downloads.
    const successToken =
      planId === 'single' && trackId ? signDownloadToken(trackId, 24 * 60 * 60) : null;
    const successUrl =
      planId === 'pro'
        ? `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        : `${origin}/tracks/${trackId}?checkout=success&session_id={CHECKOUT_SESSION_ID}${successToken ? `&token=${successToken}` : ''}`;
    const cancelUrl =
      planId === 'pro'
        ? `${origin}/pricing?checkout=canceled`
        : `${origin}/tracks/${trackId}?checkout=canceled`;

    const priceId =
      planId === 'pro'
        ? process.env.STRIPE_PRO_PRICE_ID
        : process.env.STRIPE_SINGLE_PRICE_ID;

    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            unit_amount: pricing.amountCents,
            product_data: { name: pricing.label },
            ...(pricing.mode === 'subscription'
              ? { recurring: { interval: 'month' as const } }
              : {}),
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      mode: pricing.mode,
      ...(email ? { customer_email: email } : {}),
      line_items: [lineItem],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        plan: planId,
        ...(trackId ? { trackId } : {}),
        ...(sessionUserId ? { userId: sessionUserId } : {}),
      },
    });

    return NextResponse.json({ sessionUrl: session.url });
  } catch (stripeErr) {
    console.error('[stripe/checkout] Stripe session creation failed:', stripeErr);
    return NextResponse.json<ApiError>(
      {
        error: 'Failed to create checkout session',
        details: stripeErr instanceof Error ? stripeErr.message : 'Unknown Stripe error',
      },
      { status: 500 },
    );
  }
}
