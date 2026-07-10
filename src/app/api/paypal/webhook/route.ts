import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, isPaypalConfigured } from '@/lib/paypal';

/**
 * PayPal webhook handler.
 *
 * Processes subscription lifecycle events from PayPal:
 *   - BILLING.SUBSCRIPTION.ACTIVATED → set subscriptionStatus = 'active'
 *   - BILLING.SUBSCRIPTION.CANCELLED  → set subscriptionStatus = 'canceled'
 *   - PAYMENT.SALE.COMPLETED          → subscription renewal payment confirmed
 *
 * The subscriber's email is used to match the PayPal subscription to a users
 * row (same pattern as the Stripe webhook's email fallback for Pro). For
 * PAYMENT.SALE.COMPLETED, the sale resource carries a `billing_agreement_id`
 * that links back to the subscription id — we use that to find the user.
 *
 * Signature verification uses PayPal's verify-webhook-signature API with
 * PAYPAL_WEBHOOK_ID. If PAYPAL_WEBHOOK_ID is not set, verification is skipped
 * (dev mode only — production MUST set it to prevent forgery).
 */
export async function POST(request: NextRequest) {
  if (!isPaypalConfigured()) {
    console.warn('[paypal/webhook] PayPal env vars not configured');
    return NextResponse.json({ error: 'PayPal not configured' }, { status: 500 });
  }

  const rawBody = await request.text();

  // Collect PayPal transmission headers for signature verification.
  const headers: Record<string, string> = {};
  for (const key of [
    'paypal-auth-algo',
    'paypal-cert-url',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time',
  ]) {
    const val = request.headers.get(key);
    if (val) headers[key] = val;
  }

  // Verify webhook signature
  let verified = false;
  try {
    verified = await verifyWebhookSignature(headers, rawBody);
  } catch (err) {
    console.error('[paypal/webhook] Signature verification error:', err);
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  if (!verified) {
    console.error('[paypal/webhook] Signature verification failed');
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  let event: PaypalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaypalWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    console.warn('[paypal/webhook] DATABASE_URL not set — skipping DB writes');
    return NextResponse.json({ received: true });
  }

  try {
    const { db, users } = await import('@/lib/db');
    const { eq } = await import('drizzle-orm');

    const eventType = event.event_type;

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const subscriberEmail = event.resource?.subscriber?.email_address;
        const subscriptionId = event.resource?.id;
        if (!subscriberEmail) {
          console.warn('[paypal/webhook] ACTIVATED event with no subscriber email');
          break;
        }
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, subscriberEmail))
          .limit(1);

        const fields = {
          subscriptionStatus: 'active' as const,
          subscriptionId: subscriptionId ?? null,
        };
        if (existing.length > 0) {
          await db.update(users).set(fields).where(eq(users.email, subscriberEmail));
        } else {
          await db.insert(users).values({ email: subscriberEmail, ...fields });
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED': {
        const subscriptionId = event.resource?.id;
        if (subscriptionId) {
          await db
            .update(users)
            .set({ subscriptionStatus: 'canceled', subscriptionId: null })
            .where(eq(users.subscriptionId, subscriptionId));
        }
        break;
      }

      case 'PAYMENT.SALE.COMPLETED': {
        // Renewal payment. The sale resource has a billing_agreement_id that
        // maps to the subscription id — use it to re-confirm active status.
        const subscriptionId =
          event.resource?.billing_agreement_id ?? event.resource?.id;
        if (subscriptionId) {
          await db
            .update(users)
            .set({ subscriptionStatus: 'active' })
            .where(eq(users.subscriptionId, subscriptionId));
        }
        break;
      }

      default:
        console.info(`[paypal/webhook] Unhandled event type: ${eventType}`);
    }
  } catch (handlerErr) {
    console.error(`[paypal/webhook] Error handling ${event.event_type}:`, handlerErr);
    // Return 500 so PayPal retries the event. Idempotent handlers above
    // (UPDATE on subscriptionId/email) make retries safe.
    return NextResponse.json(
      { error: 'Webhook handler failed', received: false },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

// --- PayPal webhook event shapes (subset we handle) -------------------------

interface PaypalWebhookEvent {
  event_type?: string;
  resource?: {
    id?: string;
    // Subscription events: subscriber email
    subscriber?: { email_address?: string };
    // Sale events: links the sale to the billing agreement (subscription)
    billing_agreement_id?: string;
  };
}