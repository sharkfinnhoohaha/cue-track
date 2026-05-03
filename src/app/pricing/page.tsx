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
      'Unlimited track downloads',
      'Saved presets & templates',
      'Priority rendering queue',
      'All premium voices',
      'Batch generation',
      'Cancel anytime',
    ],
    cta: 'Start Pro',
    ctaHref: '/api/subscribe?plan=pro',
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
        <span className="text-sm font-medium text-[#F0EDE6] pr-4">{q}</span>
        <svg
          className={cn(
            'h-4 w-4 text-muted flex-shrink-0 transition-transform duration-200',
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
          <p className="text-sm text-muted leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F0EDE6] sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
            Pay per track or go unlimited with Pro. No hidden fees, no surprise charges.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid gap-6 sm:grid-cols-2 max-w-3xl mx-auto mb-24">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                'relative rounded-xl border p-6 sm:p-8 transition-all',
                plan.highlighted
                  ? 'border-accent/40 bg-surface-raised glow-accent'
                  : 'border-surface-border bg-surface-raised',
              )}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-6">
                  <span className="badge-accent font-mono text-xs uppercase px-3 py-1">
                    Most Popular
                  </span>
                </div>
              )}

              <h2 className="font-display text-2xl font-semibold text-[#F0EDE6]">
                {plan.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{plan.description}</p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-5xl font-bold text-[#F0EDE6]">
                  {plan.price}
                </span>
                <span className="text-muted text-sm">{plan.period}</span>
              </div>

              <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CheckIcon />
                    <span className="text-sm text-[#C0BDB6]">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Link href={plan.ctaHref} className="block">
                  <Button
                    variant={plan.highlighted ? 'primary' : 'secondary'}
                    size="lg"
                    className="w-full"
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-[#F0EDE6] text-center mb-10">
            Frequently Asked Questions
          </h2>
          <div>
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
