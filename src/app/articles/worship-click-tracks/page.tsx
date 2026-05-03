import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'How to Create Click Tracks for Worship Bands | Cue Track',
  description:
    'A practical guide for worship leaders who need click tracks for originals, obscure songs, and custom arrangements without a DAW.',
  openGraph: {
    title: 'How to Create Click Tracks for Worship Bands',
    description: 'Build click tracks with spoken cue announcements for your worship team in under two minutes.',
    type: 'article',
  },
};

export default function WorshipClickTracksPage() {
  return (
    <div className="min-h-screen bg-surface text-white">
      <Nav />
      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-4">Worship</p>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6">How to Create Click Tracks for Worship Bands</h1>
            <p className="font-body text-lg text-neutral-400 leading-relaxed">
              Your worship team plays originals, deep cuts, and songs that aren&apos;t in any catalog. You need click tracks with spoken cues, and you need them without opening a DAW. Here&apos;s how.
            </p>
          </header>
          <div className="space-y-8">
            <section>
              <h2 className="font-display text-2xl mb-4">Why worship bands need click tracks</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">Modern worship music depends on tight arrangements. Songs move between sections with specific dynamics: a quiet verse builds into a driving chorus, a bridge drops to half the band, the tag repeats three times before the final resolve. Without a shared timing reference, these transitions become guesswork.</p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">A click track gives every musician on IEMs a steady pulse. But the real value is the cue track layered on top: spoken announcements that tell the band &quot;Chorus&quot; one bar before the chorus starts, count-ins at the top of each section, and optional bar countdowns so everyone knows exactly when the transition hits.</p>
              <p className="font-body text-neutral-300 leading-relaxed">This matters most when you&apos;re not running multitrack stems from a catalog. If your setlist includes originals, arrangements by your own team, or songs from smaller artists, Loop Community and MultiTracks won&apos;t have pre-built cue tracks for you. You need to make your own.</p>
            </section>
            <section>
              <h2 className="font-display text-2xl mb-4">Building a click track for your worship set</h2>
              <div className="space-y-6">
                <div><h3 className="font-mono text-sm text-accent-500 mb-2">1. Find the BPM</h3><p className="font-body text-neutral-300 leading-relaxed">Play the song and tap along to find the tempo. Common worship tempos: slow ballads 65–80, mid-tempo 90–110, upbeat 115–135.</p></div>
                <div><h3 className="font-mono text-sm text-accent-500 mb-2">2. Identify the time signature</h3><p className="font-body text-neutral-300 leading-relaxed">Most worship songs are 4/4. Some are 6/8 (&quot;What a Beautiful Name,&quot; &quot;So Will I&quot;). If you count to four naturally, it&apos;s 4/4.</p></div>
                <div><h3 className="font-mono text-sm text-accent-500 mb-2">3. Map the song structure</h3><p className="font-body text-neutral-300 leading-relaxed mb-3">Count the bars in each section. Write it out: Intro 4 bars, Verse 8 bars, Chorus 8 bars, Bridge 4 bars, Outro 4 bars.</p></div>
                <div><h3 className="font-mono text-sm text-accent-500 mb-2">4. Choose your cue options</h3><p className="font-body text-neutral-300 leading-relaxed">Enable section announcements so the band hears &quot;Verse,&quot; &quot;Chorus,&quot; &quot;Bridge&quot; one bar before each transition.</p></div>
                <div><h3 className="font-mono text-sm text-accent-500 mb-2">5. Generate and download</h3><p className="font-body text-neutral-300 leading-relaxed">Render the track, preview the first 15 seconds, then download the full WAV or MP3. Load it into your playback app.</p></div>
              </div>
            </section>
            <div className="border-t border-surface-border pt-8 mt-12">
              <div className="bg-surface-raised border border-surface-border rounded-lg p-8 text-center">
                <h3 className="font-display text-2xl mb-3">Build a click track for your worship set</h3>
                <p className="font-body text-neutral-400 mb-6">Enter your BPM, song structure, and pick a voice. Download a stage-ready click/cue track in under two minutes.</p>
                <Link href="/create" className="inline-flex items-center gap-2 bg-accent-500 text-black font-mono text-sm font-semibold px-8 py-4 rounded hover:bg-accent-400 transition-colors">
                  Create a Track
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </article>
      <Footer />
    </div>
  );
}
