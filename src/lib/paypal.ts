/**
 * PayPal REST API helpers.
 *
 * Direct fetch calls to the PayPal REST API — no SDK dependency. The PayPal
 * access token is cached in-memory with a 5-minute buffer before expiry so we
 * don't request a new token on every call.
 *
 * Base URL: live (https://api-m.paypal.com) by default. Set PAYPAL_API_BASE
 * to https://api-m.sandbox.paypal.com for sandbox testing.
 *
 * Required env vars:
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *
 * Optional:
 *   PAYPAL_API_BASE  (defaults to https://api-m.paypal.com)
 */

const DEFAULT_BASE = 'https://api-m.paypal.com';

function apiBase(): string {
  return process.env.PAYPAL_API_BASE || DEFAULT_BASE;
}

/** Whether PayPal server-side credentials are configured. */
export function isPaypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Obtain (or return cached) a PayPal access token using client_credentials. */
export async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');
  }

  // Return cached token if it has >5 min of life left.
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.value;
  }

  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PayPal token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/** Create a PayPal Orders v2 order for a one-time purchase. */
export async function createOrder(amount: string, currency: string, description: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: currency, value: amount },
          description,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PayPal create-order failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Capture an approved PayPal order. Returns the capture result. */
export async function captureOrder(orderId: string): Promise<{
  id: string;
  status: string;
  payerEmail: string | null;
}> {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PayPal capture failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    payer?: { email_address?: string };
    purchase_units?: Array<{
      payments?: { captures?: Array<{ status: string }> };
    }>;
  };

  // Determine overall payment status from capture result
  const captureStatus = data.purchase_units?.[0]?.payments?.captures?.[0]?.status;
  const payerEmail = data.payer?.email_address ?? null;

  return {
    id: data.id,
    status: captureStatus === 'COMPLETED' ? 'COMPLETED' : data.status,
    payerEmail,
  };
}

/** Create a PayPal subscription for a recurring plan. Returns the approval URL. */
export async function createSubscription(planId: string, returnUrl: string, cancelUrl: string): Promise<{
  subscriptionId: string;
  approvalUrl: string;
}> {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase()}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: planId,
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        user_action: 'SUBSCRIBE_NOW',
        shipping_preference: 'NO_SHIPPING',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PayPal create-subscription failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    links: Array<{ rel: string; href: string }>;
  };

  const approvalLink = data.links.find((l) => l.rel === 'approve');
  if (!approvalLink) {
    throw new Error('PayPal subscription response missing approval link');
  }

  return {
    subscriptionId: data.id,
    approvalUrl: approvalLink.href,
  };
}

/** Verify a PayPal webhook signature (CAL or simulation). */
export async function verifyWebhookSignature(
  headers: Record<string, string>,
  rawBody: string,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    // If no webhook ID configured, skip verification (dev mode).
    // Production should always set PAYPAL_WEBHOOK_ID.
    console.warn('[paypal/webhook] PAYPAL_WEBHOOK_ID not set — skipping signature verification');
    return true;
  }

  const token = await getAccessToken();
  const res = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'] || headers['PAYPAL-AUTH-ALGO'] || '',
      cert_url: headers['paypal-cert-url'] || headers['PAYPAL-CERT-URL'] || '',
      transmission_id: headers['paypal-transmission-id'] || headers['PAYPAL-TRANSMISSION-ID'] || '',
      transmission_sig: headers['paypal-transmission-sig'] || headers['PAYPAL-TRANSMISSION-SIG'] || '',
      transmission_time: headers['paypal-transmission-time'] || headers['PAYPAL-TRANSMISSION-TIME'] || '',
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  });

  if (!res.ok) {
    console.error('[paypal/webhook] Signature verification request failed:', res.status);
    return false;
  }

  const data = (await res.json()) as { verification_status: string };
  return data.verification_status === 'SUCCESS';
}