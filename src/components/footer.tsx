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
    <footer className="border-t border-black/[.08] mt-auto">
      <div className="max-w-[1080px] mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <span className="font-mono text-[16px] font-semibold tracking-[.05em] uppercase text-[#6e6e73]">
          Cue Track
        </span>
        <nav className="flex gap-6">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[12px] text-[#b0b0b5] hover:text-[#6e6e73] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="font-mono text-[11px] text-[#b0b0b5] tracking-[.04em]">
          © 2026 Cue Track
        </span>
      </div>
    </footer>
  );
}
