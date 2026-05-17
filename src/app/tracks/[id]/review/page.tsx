import { redirect, notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { TrackForm } from '@/components/track-form';
import { auth } from '@/auth';
import type { SongSpec } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReviewPageProps {
  params: { id: string };
}

/**
 * Review screen for an uploaded track. The /api/tracks/analyze route inserts
 * a draft row with status='rendering' and a suggested SongSpec; this page
 * pre-populates the TrackForm with that spec so the user can adjust BPM,
 * sections, voice, or click sound before submitting.
 *
 * On submit, TrackForm POSTs to /api/tracks/generate with `existingTrackId`
 * set, which UPDATEs the draft to status='ready' and triggers the standard
 * render-on-download pipeline.
 *
 * If the track has already been finalized (status='ready' or 'failed'), the
 * page redirects to the detail route so users do not double-finalize or
 * stare at a stale draft.
 */
export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = params;
  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not configured. /tracks/[id]/review needs DB access to load the draft spec.',
    );
  }

  const { db, tracks } = await import('@/lib/db');
  const rows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      spec: tracks.spec,
      status: tracks.status,
      duration: tracks.duration,
    })
    .from(tracks)
    .where(eq(tracks.id, id))
    .limit(1);

  const track = rows[0];
  if (!track) notFound();

  if (track.status !== 'rendering') {
    redirect(`/tracks/${id}`);
  }

  const session = await auth();
  const isAuthenticated = !!session?.user?.id;

  // The spec column is typed as jsonb<SongSpec> at the schema layer; the
  // runtime value comes back as a plain object that matches the shape.
  const initialSpec = track.spec as SongSpec;

  return (
    <>
      <Nav />
      <div className="border-b border-black/[.08]">
        <section className="max-w-3xl mx-auto px-6 pt-20 pb-10 text-center">
          <p className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-4">
            Review &amp; finalize
          </p>
          <h1 className="font-sans font-black tracking-[-0.035em] text-[#1d1d1f] mb-3 text-[clamp(28px,3.6vw,42px)]">
            Looks like {Math.round(initialSpec.bpm)} BPM.
          </h1>
          <p className="text-[15px] text-[#6e6e73] max-w-[520px] mx-auto leading-[1.55]">
            We detected the tempo and laid out a default section template.
            Adjust anything that&apos;s off, then finalize to render your cue track.
            {track.duration
              ? ` (Detected ~${Math.round(track.duration)}s of audio.)`
              : ''}
          </p>
        </section>
      </div>

      <div className="bg-[#fafafa]">
        <section className="max-w-3xl mx-auto px-6 py-12">
          <TrackForm
            isAuthenticated={isAuthenticated}
            initialSpec={initialSpec}
            existingTrackId={track.id}
          />
        </section>
      </div>

      <Footer />
    </>
  );
}
