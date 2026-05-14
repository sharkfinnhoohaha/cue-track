/**
 * Next.js middleware: protects /dashboard behind authentication.
 *
 * Unauthenticated users hitting /dashboard are redirected to /auth/signin
 * with a callbackUrl so they return after sign-in.
 *
 * Public routes (/create, /pricing, /tracks/*, /api/*, /auth/*, static assets)
 * pass through without a session check.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require an authenticated session.
const PROTECTED_PREFIXES = ['/dashboard'];

// Routes that are always public (no session check).
// Everything not in PROTECTED_PREFIXES is also public by default,
// but listing these explicitly documents the intent.
const PUBLIC_PREFIXES = [
  '/api/',
  '/auth/',
  '/_next/',
  '/favicon',
  '/og-image',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes and static assets entirely.
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Only gate protected routes; everything else passes through.
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  // Check for a NextAuth session token cookie.
  // NextAuth v5 uses __Secure-authjs.session-token in production
  // and authjs.session-token in development.
  const sessionToken =
    request.cookies.get('__Secure-authjs.session-token')?.value ??
    request.cookies.get('authjs.session-token')?.value ??
    request.cookies.get('next-auth.session-token')?.value ??
    request.cookies.get('__Secure-next-auth.session-token')?.value;

  if (!sessionToken) {
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except static files and images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
