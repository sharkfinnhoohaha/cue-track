'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * Submit button that disables itself and shows a pending label while its
 * enclosing server-action form is in flight. Prevents the double-submit that
 * would otherwise fire a server action (e.g. sending two magic-link emails)
 * when a user clicks twice on a slow connection.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(className, pending && 'opacity-60 cursor-not-allowed')}
    >
      {pending ? pendingLabel ?? 'Working…' : children}
    </button>
  );
}
