import React from 'react';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { CreateExperience } from '@/components/create-experience';
import { auth } from '@/auth';

/**
 * /create — the primary, guided "make a cue track" entry point.
 *
 * Upload-first: the page leads with the upload→analyze→review→download flow
 * (the headline product). Manual mode (enter BPM + sections by hand) is kept
 * but demoted to an opt-in panel inside CreateExperience; ?mode=manual opens
 * it directly (used by the landing-page "build manually" link and the
 * TrackForm sign-up round-trip). The route stays anonymous-reachable so users
 * can try an analysis before committing to sign-up; the gates live downstream
 * (the analyze paywall after the free analysis, and the manual-mode signup
 * modal in TrackForm).
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: { mode?: string };
}) {
  const session = await auth();
  const isAuthenticated = !!session?.user?.id;
  const initialManual = searchParams?.mode === 'manual';

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-12 text-center">
          <p className="font-sans text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-4 font-semibold">
            Create a cue track
          </p>
          <h1 className="font-sans font-extrabold tracking-tight text-white mb-4 text-3xl md:text-4xl">
            Upload your song. We&apos;ll do the rest.
          </h1>
          <p className="text-sm text-zinc-400 max-w-[520px] mx-auto leading-relaxed">
            Drop your track and we&apos;ll detect the tempo and lay out your
            sections. Review the suggestion, then download your click + cue
            track. Your first analysis is free.
          </p>
        </div>

        <CreateExperience
          isAuthenticated={isAuthenticated}
          initialManual={initialManual}
        />
      </main>
      <Footer />
    </>
  );
}
