import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'BPM and Time Signature Basics for Live Performance | Cue Track',
  description: 'A practical guide to BPM, time signatures, and tempo for live musicians.',
  openGraph: { title: 'BPM and Time Signature Basics for Live Performance', description: 'A practical guide to BPM, time signatures, and tempo for live musicians.', type: 'article' },
};

export default function BpmTimeSignatureBasicsPage() {
  return (
    <div className="min-h-screen bg-surface text-white">
      <Nav />
      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-4">Fundamentals</p>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6">BPM and Time Signature Basics for Live Performance</h1>
            <p className="font-body text-lg text-neutral-400 leading-relaxed">Whether you&apos;re a drummer locking in tempo or a worship leader counting in the band, BPM and time signatures are the foundation everything else sits on.</p>
          </header>
          <div className="space-y-8">
            <section>
              <h2 className="font-display text-2xl mb-4">What BPM actually means</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">BPM stands for beats per minute. A song at 120 BPM has exactly two beats per second. If you&apos;re not sure what BPM your song is, use a tap tempo tool.</p>
              <div className="bg-surface-raised border border-surface-border rounded-lg p-6 my-6">
                <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-3">Common BPM ranges</p>
                <div className="grid grid-cols-2 gap-3 font-body text-sm text-neutral-300">
                  <div><span className="font-mono text-white">60–80</span> — Ballads, slow worship</div>
                  <div><span className="font-mono text-white">80–100</span> — Moderate groove</div>
                  <div><span className="font-mono text-white">100–120</span> — Pop, modern worship</div>
                  <div><span className="font-mono text-white">120–140</span> — Upbeat rock, dance</div>
                </div>
              </div>
            </section>
            <section>
              <h2 className="font-display text-2xl mb-4">Time signatures explained</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">A time signature tells you how many beats are in each bar (top number) and what note value gets one beat (bottom number). In 4/4 time, there are four quarter-note beats per bar.</p>
            </section>
            <div className="border-t border-surface-border pt-8 mt-12">
              <div className="bg-surface-raised border border-surface-border rounded-lg p-8 text-center">
                <h3 className="font-display text-2xl mb-3">Ready to build your first click track?</h3>
                <p className="font-body text-neutral-400 mb-6">Enter your song&apos;s BPM, structure, and time signature. Get a downloadable click/cue track in two minutes.</p>
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
