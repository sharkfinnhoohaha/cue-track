import React from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  elevated?: boolean;
}

export function Card({ header, elevated = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface-raised border border-surface-border rounded-2xl',
        className,
      )}
      {...props}
    >
      {header && (
        <div className="px-5 py-4 border-b border-surface-border">
          {typeof header === 'string' ? (
            <h4 className="font-sans tracking-wide text-xs font-bold text-zinc-300 uppercase">{header}</h4>
          ) : (
            header
          )}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function CardGrid({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('grid gap-4', className)} {...props}>
      {children}
    </div>
  );
}
