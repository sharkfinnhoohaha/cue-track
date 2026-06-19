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
        <div className="mb-10 text-center">
          <p className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-3">
            Create a cue track
          </p>
          <h1 className="font-display font-bold tracking-[-0.035em] text-[#1d1d1f] mb-3 text-[clamp(30px,4vw,46px)]">
            Upload your song. We&apos;ll do the rest.
          </h1>
          <p className="text-[15px] text-[#6e6e73] max-w-[520px] mx-auto leading-[1.55]">
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
