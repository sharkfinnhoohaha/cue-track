'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

// ---------- Data ----------

const PLANS = [
  {
    id: 'single' as const,
    name: 'Per Track',
    price: '$3',
    period: 'one-time',
    description: 'Pay only when you need a track. No commitment.',
    features: [
      'One-time payment per track',
      'WAV or MP3 download',
      'Custom song structure',
      'Spoken voice cues',
      'Instant preview before purchase',
      'Multiple click sounds',
    ],
    cta: 'Create a Track',
    ctaHref: '/create',
    highlighted: false,
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: '$19',
    period: '/month',
    description: 'Unlimited tracks for working musicians and worship teams.',
    features: [
      'Unlimited uploads & analyses',
      'Unlimited downloads from your own tracks',
      'Saved presets & templates',
      'Priority rendering queue',
      'All premium voices',
      'Cancel anytime',
    ],
    cta: 'Start Pro',
    // Unused for Pro — the button has an onClick handler that starts Stripe
    // Checkout. Kept here so PLANS stays a uniform-shape array.
    ctaHref: '#',
    highlighted: true,
  },
];

const FAQ_ITEMS = [
  {
    q: 'What format are the tracks?',
    a: 'You can choose between WAV (44.1kHz, 16-bit) for studio quality or MP3 (320kbps) for smaller file sizes. Both are suitable for live performance through in-ear monitors.',
  },
  {
    q: 'Can I customize the click sound?',
    a: 'Yes. You can choose between a classic sine wave click, woodblock, rimshot, and hi-hat. Each sound is tuned for clarity in a live mix.',
  },
  {
    q: 'What are voice cues?',
    a: 'Voice cues are spoken announcements that tell you which section is coming next. For example, you will hear "Verse" before the verse starts. This helps musicians navigate the song without watching a screen.',
  },
  {
    q: 'Can I change time signatures within a song?',
    a: 'Currently, each track uses a single time signature. Support for per-section time signature changes is on our roadmap.',
  },
  {
    q: 'Do I need an account?',
    a: 'You can create and preview tracks without an account. You only need an email to purchase a download or subscribe to Pro.',
  },
  {
    q: 'What is the refund policy?',
    a: 'Per-track purchases are non-refundable since you receive the full audio file immediately. Pro subscriptions can be canceled anytime, and you will retain access through the end of your billing period.',
  },
];

// ---------- Component ----------

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-surface-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="text-sm font-semibold text-white pr-4">{q}</span>
        <svg
          className={cn(
            'h-4 w-4 text-zinc-500 flex-shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="pb-5 pr-8 animate-fade-in">
          <p className="text-sm text-zinc-400 leading-relaxed font-normal">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  const [proLoading, setProLoading] = useState(false);
  const [proError, setProError] = useState<string | null>(null);

  const handleStartPro = async () => {
    setProLoading(true);
    setProError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });
      if (res.status === 401) {
        // Not signed in — bounce through sign-in and come back to /pricing.
        window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent('/pricing')}`;
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Checkout failed (${res.status})`);
      }
      const data = (await res.json()) as { sessionUrl?: string };
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      } else {
        throw new Error('Checkout did not return a URL');
      }
    } catch (err) {
      setProError(
        err instanceof Error ? err.message : 'Could not start Pro checkout.',
      );
      setProLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-32 pb-24">
        {/* Header */}
        <div className="text-center mb-20">
          <h1 className="font-sans font-extrabold tracking-tight text-white mb-4 text-3xl sm:text-5xl">
            Simple, transparent pricing.
          </h1>
          <p className="mt-4 text-sm text-zinc-400 max-w-xl mx-auto font-normal">
            Pay per track or go unlimited with Pro. No subscription tricks, cancel anytime.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto mb-24">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className="card p-8 bg-zinc-900/10 relative flex flex-col justify-between"
            >
              {plan.highlighted && (
                <div className="absolute top-4 right-4 z-10">
                  <span className="inline-flex items-center whitespace-nowrap bg-accent px-3 py-1 font-sans text-[9px] font-bold uppercase tracking-wider text-white rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div>
                <h2 className="font-sans font-bold tracking-tight text-white text-2xl">
                  {plan.name}
                </h2>
                <p className="mt-2 text-sm text-zinc-400 font-normal">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-sans text-5xl font-extrabold text-white">
                    {plan.price}
                  </span>
                  <span className="text-zinc-500 font-sans text-sm">{plan.period}</span>
                </div>

                <ul className="mt-8 space-y-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckIcon />
                      <span className="text-sm text-zinc-400 font-normal">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10">
                {plan.id === 'pro' ? (
                  <>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      onClick={handleStartPro}
                      loading={proLoading}
                    >
                      {plan.cta}
                    </Button>
                    {proError && (
                      <p className="mt-3 text-xs font-sans text-red-500 text-center tracking-wide">{proError}</p>
                    )}
                  </>
                ) : (
                  <Link href={plan.ctaHref} className="block">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full bg-transparent border border-white/20 hover:bg-white/5"
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="font-sans font-bold tracking-tight text-white text-center text-2xl md:text-3xl mb-12">
            Frequently asked questions
          </h2>
          <div className="space-y-1">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
