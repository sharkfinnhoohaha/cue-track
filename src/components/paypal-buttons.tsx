'use client';

import React, { useState } from 'react';
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';

/**
 * Whether PayPal is enabled (NEXT_PUBLIC_PAYPAL_CLIENT_ID is set). Client-side
 * check used by pages to conditionally render PayPal UI. When false, the app
 * falls back to Stripe-only.
 */
export function isPaypalEnabled(): boolean {
  const id = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  return typeof id === 'string' && id.length > 0;
}

/**
 * PayPal button for single-track ($3 one-time) purchases.
 *
 * Flow:
 *   1. createOrder → POST /api/paypal/create-order → PayPal order ID
 *   2. Buyer approves the payment in the PayPal popup
 *   3. onApprove → POST /api/paypal/capture → records purchase, emails
 *      download link, returns a short-lived download token
 *   4. onSuccess callback fires with the download URL (or undefined)
 *
 * Wraps itself in a PayPalScriptProvider so it's self-contained — each
 * instance loads the PayPal SDK once. Only renders when
 * NEXT_PUBLIC_PAYPAL_CLIENT_ID is set; returns null otherwise (graceful
 * fallback to Stripe-only).
 */
interface PayPalSingleTrackButtonProps {
  trackId: string;
  email?: string;
  onSuccess: (downloadUrl?: string) => void;
  onError?: (message: string) => void;
}

export function PayPalSingleTrackButton({
  trackId,
  email,
  onSuccess,
  onError,
}: PayPalSingleTrackButtonProps) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) return null;

  return (
    <PayPalScriptProvider
      options={{ clientId, currency: 'USD', intent: 'capture' }}
    >
      <PayPalSingleTrackButtonInner
        trackId={trackId}
        email={email}
        onSuccess={onSuccess}
        onError={onError}
      />
    </PayPalScriptProvider>
  );
}

// Inner component that has access to the PayPalScriptProvider context.
function PayPalSingleTrackButtonInner({
  trackId,
  email,
  onSuccess,
  onError,
}: PayPalSingleTrackButtonProps) {
  const [{ isPending }] = usePayPalScriptReducer();
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <div className="w-full">
      {isPending ? (
        <div className="flex h-[36px] items-center justify-center rounded-lg bg-[#ffc439]/20 text-xs text-muted">
          Loading PayPal…
        </div>
      ) : (
        <PayPalButtons
          style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay', height: 36 }}
          forceReRender={[trackId]}
          createOrder={async () => {
            const res = await fetch('/api/paypal/create-order', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ trackId, email }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(body.error || 'Failed to create PayPal order');
            }
            const data = (await res.json()) as { orderID: string };
            return data.orderID;
          }}
          onApprove={async (data) => {
            const res = await fetch('/api/paypal/capture', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ orderID: data.orderID, trackId, email }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              const msg = body.error || 'PayPal capture failed';
              setLocalError(msg);
              onError?.(msg);
              return;
            }
            const result = (await res.json()) as { success?: boolean; downloadUrl?: string };
            onSuccess(result.downloadUrl);
          }}
          onError={(err) => {
            const msg = err instanceof Error ? err.message : 'PayPal payment failed';
            setLocalError(msg);
            onError?.(msg);
          }}
        />
      )}
      {localError && (
        <p className="mt-2 text-xs text-red-600 text-center">{localError}</p>
      )}
    </div>
  );
}