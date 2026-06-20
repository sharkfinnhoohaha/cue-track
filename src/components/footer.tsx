import React from 'react';
import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/create',    label: 'Create' },
  { href: '/pricing',   label: 'Pricing' },
  { href: '/articles',  label: 'Guides' },
  { href: '/privacy',   label: 'Privacy' },
  { href: '/terms',     label: 'Terms' },
  { href: '/contact',   label: 'Contact' },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black mt-auto">
      <div className="max-w-[1080px] mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <span className="font-sans font-bold tracking-tight text-sm text-zinc-400">
          Cue Track
        </span>
        <nav className="flex flex-wrap justify-center gap-6">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-sans text-zinc-500 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="font-sans text-xs text-zinc-600">
          © 2026 Cue Track
        </span>
      </div>
    </footer>
  );
}
