import { NextRequest, NextResponse } from 'next/server';
import type { ApiError } from '@/types';

// ---------------------------------------------------------------------------
// POST /api/waitlist
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json<ApiError>(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  const { email } = body as { email?: string };

  if (!email || typeof email !== 'string') {
    return NextResponse.json<ApiError>(
      { error: 'email is required' },
      { status: 400 },
    );
  }

  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    return NextResponse.json<ApiError>(
      { error: 'Invalid email address format' },
      { status: 400 },
    );
  }

  // For now, log the signup. In production this would write to DB / mailing list.
  console.info(`[waitlist] New signup: ${trimmed}`);

  return NextResponse.json({ success: true });
}
