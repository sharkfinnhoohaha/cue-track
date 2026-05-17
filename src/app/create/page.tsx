import React from 'react';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { TrackForm } from '@/components/track-form';
import { auth } from '@/auth';

/**
 * /create — manual mode (full page).
 *
 * Mirrors the manual-mode section on the landing page but as a standalone
 * route, so deep-links and dashboard links land somewhere appropriate. The
 * submit gate is enforced inside TrackForm (anonymous users see a hard
 * signup modal with no skip path); the route itself stays anonymous-
 * reachable so users can window-shop the form before committing to signup.
 */
export default async function CreatePage() {
  const session = await auth();
  const isAuthenticated = !!session?.user?.id;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F0EDE6] sm:text-5xl">
            Manual mode
          </h1>
          <p className="mt-3 text-muted text-lg leading-relaxed max-w-xl">
            Skip the upload. Specify your BPM, sections, and click sound
            directly; we&apos;ll build your cue track.
            {!isAuthenticated && ' Sign up free to enable; manual mode is generous once you do.'}
          </p>
        </div>

        <TrackForm isAuthenticated={isAuthenticated} />
      </main>
      <Footer />
    </>
  );
}
