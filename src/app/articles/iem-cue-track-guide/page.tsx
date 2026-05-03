import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'The Complete IEM Cue Track Guide for Live Musicians | Cue Track',
  description: 'Everything you need to know about cue tracks for in-ear monitors: what they are, why you need them, types of cues, and how to structure them for live performance.',
  openGraph: { title: 'The Complete IEM Cue Track Guide for Live Musicians', description: 'Learn how cue tracks help IEM users navigate live performances with spoken section announcements, count-ins, and bar countdowns.', type: 'article' },
};

export default function IemCueTrackGuidePage() {
  return (
    <div className="min-h-screen bg-surface text-white">
      <Nav />
      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-4">Live Sound</p>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6">The Complete IEM Cue Track Guide for Live Musicians</h1>
            <p className="font-body text-lg text-neutral-400 leading-relaxed">When you&apos;re wearing in-ear monitors, you can&apos;t hear the drummer count off. A cue track solves this by putting a voice in your ears that tells you exactly what&apos;s coming next.</p>
          </header>
          <div className="space-y-8">
            <section>
              <h2 className="font-display text-2xl mb-4">Click track vs. cue track</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">A <strong className="text-white">click track</strong> is a metronome: a steady pulse at your song&apos;s BPM. A <strong className="text-white">cue track</strong> adds spoken section names, count-ins, and bar countdowns on top of the click.</p>
            </section>
            <section>
              <h2 className="font-display text-2xl mb-4">Types of audio cues</h2>
              <div className="space-y-6">
                <div className="border-l-2 border-accent-500/30 pl-6"><h3 className="font-mono text-sm font-semibold mb-2">Section announcements</h3><p className="font-body text-neutral-300 leading-relaxed">A spoken voice says the name of the upcoming section one bar before the transition.</p></div>
                <div className="border-l-2 border-accent-500/30 pl-6"><h3 className="font-mono text-sm font-semibold mb-2">Count-ins</h3><p className="font-body text-neutral-300 leading-relaxed">A spoken &quot;1, 2, 3, 4&quot; at the start of each section. Numbers land on actual beat positions.</p></div>
                <div className="border-l-2 border-accent-500/30 pl-6"><h3 className="font-mono text-sm font-semibold mb-2">Bar countdowns</h3><p className="font-body text-neutral-300 leading-relaxed">&quot;4 bars,&quot; &quot;3 bars,&quot; &quot;2 bars,&quot; &quot;1 bar&quot; leading into a transition. Useful for long sections.</p></div>
              </div>
            </section>
            <div className="border-t border-surface-border pt-8 mt-12">
              <div className="bg-surface-raised border border-surface-border rounded-lg p-8 text-center">
                <h3 className="font-display text-2xl mb-3">Generate your first cue track</h3>
                <p className="font-body text-neutral-400 mb-6">Enter your song&apos;s BPM and structure, pick a voice, and download a click/cue track ready for your IEM rig.</p>
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
