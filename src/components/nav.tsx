'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/cn';

const NAV_LINKS = [
  { href: '/create',    label: 'Create' },
  { href: '/pricing',   label: 'Pricing' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // null = unknown (initial). Avoids flashing the wrong auth state: the
  // "Sign in" link only renders once we've confirmed there's no session.
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((session) => {
        if (!cancelled) setAuthed(Boolean(session && session.user));
      })
      .catch(() => {
        if (!cancelled) setAuthed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = () => {
    void signOut({ callbackUrl: '/' });
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-all duration-200',
        scrolled ? 'bg-black/90 border-b border-white/10 backdrop-blur-md' : 'bg-transparent border-b border-transparent',
      )}
    >
      <nav className="max-w-[1080px] mx-auto px-6 h-[64px] flex items-center justify-between">
        <Link
          href="/"
          className="font-sans font-bold text-lg tracking-tight text-white hover:opacity-75 transition-opacity"
        >
          Cue Track
        </Link>
 
        <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'text-xs font-sans font-medium tracking-wide transition-colors',
                  pathname === link.href
                    ? 'text-white font-semibold'
                    : 'text-zinc-400 hover:text-white',
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
 
        <div className="hidden md:flex items-center gap-6">
          {authed === false && (
            <Link
              href="/auth/signin"
              className="text-xs font-sans font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Sign in
            </Link>
          )}
          {authed === true && (
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs font-sans font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          )}
          <Link
            href="/create"
            className="text-xs font-sans font-semibold text-accent hover:opacity-80 transition-opacity"
          >
            Create track →
          </Link>
        </div>
 
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden rounded-lg p-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/[.05] transition-colors"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          )}
        </button>
      </nav>
 
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-black px-6 pb-6 pt-4 flex flex-col gap-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="py-2 text-sm font-sans font-medium text-zinc-400 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
          {authed === false && (
            <Link
              href="/auth/signin"
              className="py-2 text-sm font-sans font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Sign in
            </Link>
          )}
          {authed === true && (
            <button
              type="button"
              onClick={handleSignOut}
              className="py-2 text-left text-sm font-sans font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          )}
          <Link
            href="/create"
            className="mt-2 inline-flex text-sm font-sans font-semibold text-accent hover:opacity-80"
          >
            Create track →
          </Link>
        </div>
      )}
    </header>
  );
}
