import { NextRequest, NextResponse } from 'next/server';
import type { ApiError } from '@/types';
import { isPaypalConfigured, captureOrder } from '@/lib/paypal';

/**
 * Capture an approved PayPal order for a single-track purchase.
 *
 * Body: { orderID: string, trackId: string, email?: string }
 * Returns: { success: true, downloadUrl?: string }
 *
 * After the buyer approves the PayPal popup, the client calls this endpoint
 * to capture the payment, record the purchase in the DB, and email a signed
 * download link — mirroring the Stripe webhook's single-track handler.
 *
 * Idempotency: the purchases table has a UNIQUE constraint on
 * paypalOrderId. If the same order is captured twice (e.g. user
 * double-clicks), the second insert hits the constraint and is treated
 * as "already processed" — the buyer still gets their download.
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

  const { orderID, trackId, email: bodyEmail } = body as {
    orderID?: string;
    trackId?: string;
    email?: string;
  };

  if (!orderID || typeof orderID !== 'string') {
    return NextResponse.json<ApiError>(
      { error: 'orderID is required' },
      { status: 400 },
    );
  }

  if (!trackId || typeof trackId !== 'string') {
    return NextResponse.json<ApiError>(
      { error: 'trackId is required' },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    console.warn('[paypal/capture] DATABASE_URL not set — cannot record purchase');
    return NextResponse.json<ApiError>(
      { error: 'Database not configured' },
      { status: 500 },
    );
  }

  try {
    // Capture the payment with PayPal
    const capture = await captureOrder(orderID);

    if (capture.status !== 'COMPLETED') {
      console.error('[paypal/capture] Capture status not COMPLETED:', capture.status);
      return NextResponse.json<ApiError>(
        { error: 'PayPal capture did not complete', details: capture.status },
        { status: 400 },
      );
    }

    const email = bodyEmail || capture.payerEmail || 'unknown';
    const { db, purchases, tracks } = await import('@/lib/db');
    const { eq } = await import('drizzle-orm');
    const { signDownloadToken } = await import('@/lib/download-token');

    // Insert purchase row (idempotent via paypalOrderId UNIQUE constraint)
    let alreadyRecorded = false;
    try {
      await db.insert(purchases).values({
        trackId,
        paypalOrderId: orderID,
        provider: 'paypal',
        status: 'paid',
        email,
        amountCents: 300,
      });
    } catch (err) {
      // Unique violation = duplicate capture, treat as success
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === '23505'
      ) {
        alreadyRecorded = true;
        console.info(`[paypal/capture] Duplicate capture for order ${orderID}; already recorded`);
      } else {
        throw err;
      }
    }

    // Email the buyer a durable download link (same as Stripe webhook)
    if (!alreadyRecorded) {
      try {
        const token = signDownloadToken(trackId, 30 * 24 * 60 * 60); // 30 days
        if (token) {
          const rows = await db
            .select({ title: tracks.title })
            .from(tracks)
            .where(eq(tracks.id, trackId))
            .limit(1);
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cuetrack.app';
          const base = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
          const downloadUrl = `${base}/tracks/${trackId}?token=${token}`;
          const { sendPurchaseEmail } = await import('@/lib/purchase-email');
          await sendPurchaseEmail({
            to: email,
            trackTitle: rows[0]?.title ?? 'your track',
            downloadUrl,
          });
        }
      } catch (emailErr) {
        console.error('[paypal/capture] Failed to send purchase email (non-fatal):', emailErr);
      }
    }

    // Return a short-lived download token for immediate download
    const immediateToken = signDownloadToken(trackId, 24 * 60 * 60);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cuetrack.app';
    const base = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
    const downloadUrl = immediateToken
      ? `${base}/tracks/${trackId}?token=${immediateToken}`
      : undefined;

    return NextResponse.json({ success: true, downloadUrl });
  } catch (err) {
    console.error('[paypal/capture] Failed:', err);
    return NextResponse.json<ApiError>(
      {
        error: 'Failed to capture PayPal payment',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}