import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('[stripe/webhook] Stripe env vars not configured');
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const StripeModule = (await import('stripe')).default;
    const stripe = new StripeModule(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        console.info(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }
  } catch (handlerErr) {
    console.error(`[stripe/webhook] Error handling ${event.type}:`, handlerErr);
    // Return a 5xx so Stripe RETRIES the event. Previously this returned 200,
    // which told Stripe the event was delivered — a transient DB error during
    // an entitlement write then permanently lost the purchase with no retry
    // (customer paid, got nothing). Duplicate re-deliveries are made safe by
    // the idempotent handlers below, so retrying is the correct default.
    return NextResponse.json(
      { error: 'Webhook handler failed', received: false },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

/**
 * Postgres unique-violation SQLSTATE. A duplicate webhook delivery for a
 * single-track purchase re-inserts the same stripeSessionId; treat that as
 * "already processed" rather than an error so Stripe stops retrying.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const plan = session.metadata?.plan;
  const trackId = session.metadata?.trackId;
  const userId = session.metadata?.userId;
  const email = session.customer_email ?? session.customer_details?.email ?? '';

  if (!process.env.DATABASE_URL) { console.warn('[stripe/webhook] DATABASE_URL not set -- skipping DB writes'); return; }

  const { db, purchases, users } = await import('@/lib/db');
  const { eq } = await import('drizzle-orm');

  if (plan === 'single' && trackId) {
    try {
      await db.insert(purchases).values({
        trackId,
        stripeSessionId: session.id,
        stripePaymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
        status: 'paid',
        email: email || 'unknown',
        amountCents: session.amount_total ?? 300,
      });
    } catch (err) {
      // Idempotency: a re-delivered checkout.session.completed for the same
      // session re-inserts the same stripeSessionId (UNIQUE). That's a no-op,
      // not a failure — swallow it so we don't 500 and trigger endless retries.
      if (!isUniqueViolation(err)) throw err;
      console.info(`[stripe/webhook] Duplicate single-track delivery for session ${session.id}; already recorded`);
    }
  } else if (plan === 'pro') {
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
    const fields = { stripeCustomerId: customerId, subscriptionStatus: 'active' as const, subscriptionId };

    // Prefer the metadata.userId set by the authenticated /api/stripe/checkout
    // call. Falling back to email keeps older flows (and any out-of-band
    // checkout sessions created without metadata) working.
    if (userId) {
      const result = await db.update(users).set(fields).where(eq(users.id, userId)).returning({ id: users.id });
      if (result.length > 0) return;
      console.warn(`[stripe/webhook] Pro checkout metadata.userId=${userId} matched no users row; falling back to email`);
    }

    if (email) {
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        await db.update(users).set(fields).where(eq(users.email, email));
      } else {
        await db.insert(users).values({ email, ...fields });
      }
    } else {
      console.warn('[stripe/webhook] Pro checkout completed with no userId and no email; subscription is orphaned');
    }
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  if (!process.env.DATABASE_URL) return;
  const { db, users } = await import('@/lib/db');
  const { eq } = await import('drizzle-orm');
  type OurStatus = 'active' | 'past_due' | 'canceled' | 'none';
  const statusMap: Record<string, OurStatus> = { active: 'active', past_due: 'past_due', canceled: 'canceled', unpaid: 'past_due', incomplete: 'none', incomplete_expired: 'canceled', trialing: 'active', paused: 'canceled' };
  await db.update(users).set({ subscriptionStatus: statusMap[subscription.status] ?? 'none' }).where(eq(users.subscriptionId, subscription.id));
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  if (!process.env.DATABASE_URL) return;
  const { db, users } = await import('@/lib/db');
  const { eq } = await import('drizzle-orm');
  await db.update(users).set({ subscriptionStatus: 'canceled', subscriptionId: null }).where(eq(users.subscriptionId, subscription.id));
}
