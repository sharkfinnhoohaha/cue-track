import { NextRequest, NextResponse } from 'next/server';
import type { ApiError } from '@/types';
import { auth } from '@/auth';
import { isPaypalConfigured, createSubscription } from '@/lib/paypal';

/**
 * Create a PayPal subscription for the Pro plan ($19/month).
 *
 * Body: {} (no params needed — plan ID comes from PAYPAL_PRO_PLAN_ID env var)
 * Returns: { approvalUrl: string }
 *
 * Requires authentication: the resulting subscription must be attached to a
 * known user. The PayPal webhook (BILLING.SUBSCRIPTION.ACTIVATED) uses the
 * subscriber email to link the subscription to a users row.
 */
export async function POST(request: NextRequest) {
  if (!isPaypalConfigured()) {
    return NextResponse.json<ApiError>(
      { error: 'PayPal is not configured' },
      { status: 503 },
    );
  }

  const planId = process.env.PAYPAL_PRO_PLAN_ID;
  if (!planId) {
    return NextResponse.json<ApiError>(
      { error: 'PAYPAL_PRO_PLAN_ID is not set' },
      { status: 503 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiError>(
      { error: 'Sign in to subscribe to Pro', code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    request.headers.get('origin') ||
    'http://localhost:3000';

  try {
    const result = await createSubscription(
      planId,
      `${origin}/dashboard?checkout=success&provider=paypal`,
      `${origin}/pricing?checkout=canceled`,
    );
    return NextResponse.json({ approvalUrl: result.approvalUrl });
  } catch (err) {
    console.error('[paypal/create-subscription] Failed:', err);
    return NextResponse.json<ApiError>(
      {
        error: 'Failed to create PayPal subscription',
        details: err instanceof Error ? err.message : 'Unknown PayPal error',
      },
      { status: 500 },
    );
  }
}