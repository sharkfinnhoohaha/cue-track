import { NextRequest, NextResponse } from 'next/server';
import type { ApiError } from '@/types';
import { isPaypalConfigured, createOrder } from '@/lib/paypal';

/**
 * Create a PayPal order for a single-track purchase ($3.00 USD).
 *
 * Body: { trackId: string, email?: string }
 * Returns: { orderID: string }
 *
 * The client uses this order ID with the PayPalButtons component to render
 * the PayPal popup. After buyer approval, the client calls /api/paypal/capture
 * to finalize the payment and record the purchase.
 */
export async function POST(request: NextRequest) {
  if (!isPaypalConfigured()) {
    return NextResponse.json<ApiError>(
      { error: 'PayPal is not configured' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    );
  }

  const { trackId } = body as { trackId?: string };

  if (!trackId || typeof trackId !== 'string') {
    return NextResponse.json<ApiError>(
      { error: 'trackId is required' },
      { status: 400 },
    );
  }

  try {
    const orderId = await createOrder('3.00', 'USD', 'Cue Track — Single Track Download');
    return NextResponse.json({ orderID: orderId });
  } catch (err) {
    console.error('[paypal/create-order] Failed:', err);
    return NextResponse.json<ApiError>(
      {
        error: 'Failed to create PayPal order',
        details: err instanceof Error ? err.message : 'Unknown PayPal error',
      },
      { status: 500 },
    );
  }
}