'use client';

import React from 'react';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';

/**
 * Reads NEXT_PUBLIC_PAYPAL_CLIENT_ID at render time. Returns null when the
 * env var is unset so the parent can gracefully omit PayPal UI (Stripe-only
 * fallback). NEXT_PUBLIC_ vars are inlined by Next.js at build time, so this
 * is safe to call in a client component.
 */
export function paypalClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Wraps children in a PayPalScriptProvider when NEXT_PUBLIC_PAYPAL_CLIENT_ID
 * is set. When it's not set, renders children unchanged — callers that
 * conditionally render PayPal buttons on `paypalClientId() !== null` never
 * hit the no-provider case, but this guard keeps things safe regardless.
 */
export function PaypalProvider({ children }: { children: React.ReactNode }) {
  const clientId = paypalClientId();
  if (!clientId) return <>{children}</>;
  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: 'USD',
        intent: 'capture',
      }}
    >
      {children}
    </PayPalScriptProvider>
  );
}