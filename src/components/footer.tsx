import React from 'react';
import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/create', label: 'Create' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function Footer() {
  return (
    <footer className="border-t border-surface-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          {/* Brand */}
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Link href="/" className="font-display text-lg font-semibold tracking-tight text-[#F0EDE6]">
              Cue Track
            </Link>
            <p className="text-xs text-muted">
              Click tracks and cue tracks for live musicians.
            </p>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-6">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted hover:text-[#F0EDE6] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t border-surface-border pt-6 text-center">
          <p className="text-xs text-muted">
            &copy; 2026 Cue Track. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
