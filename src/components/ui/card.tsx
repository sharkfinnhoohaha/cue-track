import React from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  elevated?: boolean;
}

export function Card({
  header,
  elevated = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        elevated ? 'card-elevated' : 'card',
        'overflow-hidden',
        className,
      )}
      {...props}
    >
      {header && (
        <div className="border-b border-surface-border px-6 py-4">
          {typeof header === 'string' ? (
            <h3 className="font-mono text-sm font-medium uppercase tracking-wider text-[#C0BDB6]">
              {header}
            </h3>
          ) : (
            header
          )}
        </div>
      )}
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

export function CardGrid({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
      {...props}
    >
      {children}
    </div>
  );
}
