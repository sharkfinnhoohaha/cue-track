'use client';

import React from 'react';
import { cn } from '@/lib/cn';

const variantClasses = {
  primary:   'bg-[#1d1d1f] text-[#f5f5f7] font-semibold rounded-full hover:opacity-80',
  secondary: 'border border-black/[.13] text-[#1d1d1f] bg-white rounded-lg hover:opacity-70',
  ghost:     'text-[#6e6e73] hover:text-[#1d1d1f] rounded-lg hover:bg-black/[.05]',
} as const;

const sizeClasses = {
  sm: 'px-4 py-1.5 text-xs gap-1.5',
  md: 'px-5 py-2.5 text-sm gap-2',
  lg: 'px-7 py-3 text-[15px] gap-2.5',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  loading?: boolean;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066cc] focus-visible:ring-offset-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="w-4 h-4" />}
      {children}
    </button>
  );
}
