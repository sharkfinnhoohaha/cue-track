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
        'bg-white border border-black/[.08] rounded-[14px]',
        elevated && 'shadow-sm',
        className,
      )}
      {...props}
    >
      {header && (
        <div className="px-4 py-3 border-b border-black/[.08]">
          {typeof header === 'string' ? (
            <h4 className="font-semibold text-sm text-[#1d1d1f]">{header}</h4>
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
