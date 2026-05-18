/**
 * A/B router for the analyze pipeline.
 *
 * Picks which detector ('template', 'foote', or 'ml') a given caller
 * gets for their upload. Stable on caller identifier so the same user
 * always sees the same detector within a measurement window.
 *
 * Knobs:
 *   ANALYZE_AB_SPLIT_PERCENT  (0-100, default 0) — share of traffic
 *     routed to the ML detector. Foote gets the remainder.
 *     0   = ML disabled, all traffic to Foote
 *     100 = Foote disabled, all traffic to ML
 *     50  = even split (Phase D ramp target after smoke-testing)
 *
 *   ML_WORKER_URL not set  → ML disabled regardless of split (fallback
 *     to Foote). Lets us merge PR-D before the ML worker exists in
 *     prod without breaking analyze.
 *
 * Override:
 *   ?method=foote|ml|template  on the analyze request forces that
 *     detector. Useful for QA and for the scorecard harness.
 */

import { createHash } from 'crypto';
import type { AnalyzeMethod } from '@/lib/analyze-jobs';

const VALID_METHODS = new Set<AnalyzeMethod>(['template', 'foote', 'ml']);

function parseOverride(url: URL): AnalyzeMethod | null {
  const raw = url.searchParams.get('method');
  if (!raw) return null;
  return VALID_METHODS.has(raw as AnalyzeMethod) ? (raw as AnalyzeMethod) : null;
}

function clampPercent(raw: string | undefined): number {
  const n = Number(raw ?? '0');
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function stableBucket(identifier: string): number {
  const digest = createHash('sha256').update(identifier).digest('hex');
  return parseInt(digest.slice(0, 8), 16) % 100;
}

export interface RouterContext {
  identifier: string;
  url: URL;
}

export function pickMethod(ctx: RouterContext): AnalyzeMethod {
  const override = parseOverride(ctx.url);
  if (override) return override;

  const mlConfigured = !!process.env.ML_WORKER_URL;
  if (!mlConfigured) return 'foote';

  const split = clampPercent(process.env.ANALYZE_AB_SPLIT_PERCENT);
  if (split <= 0) return 'foote';
  if (split >= 100) return 'ml';

  return stableBucket(ctx.identifier) < split ? 'ml' : 'foote';
}

export function workerForMethod(method: AnalyzeMethod): {
  url: string | undefined;
  secret: string | undefined;
  path: string;
} {
  if (method === 'ml') {
    return {
      url: process.env.ML_WORKER_URL,
      secret: process.env.ML_WORKER_SHARED_SECRET,
      path: '/analyze',
    };
  }
  return {
    url: process.env.AUDIO_WORKER_URL,
    secret: process.env.AUDIO_WORKER_SHARED_SECRET,
    path: method === 'foote' ? '/analyze/foote' : '/analyze',
  };
}
