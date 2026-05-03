'use client';

import React from 'react';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { TrackForm } from '@/components/track-form';

export default function CreatePage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        {/* Page header */}
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F0EDE6] sm:text-5xl">
            Create a Track
          </h1>
          <p className="mt-3 text-muted text-lg leading-relaxed max-w-xl">
            Define your song structure, choose your sounds, and generate a
            studio-quality click track with spoken cues.
          </p>
        </div>

        <TrackForm />
      </main>
      <Footer />
    </>
  );
}
