import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Articles | Cue Track',
  description:
    'Guides and resources for live musicians: click tracks, cue tracks, IEM setup, BPM, and time signatures.',
};

const ARTICLES = [
  {
    slug: 'worship-click-tracks',
    title: 'How to Create Click Tracks for Worship Bands',
    description:
      'A practical guide for worship leaders who need click tracks for originals, obscure songs, and custom arrangements.',
    category: 'Worship',
  },
  {
    slug: 'iem-cue-track-guide',
    title: 'The Complete IEM Cue Track Guide for Live Musicians',
    description:
      'Everything you need to know about cue tracks: what they are, why IEM users need them, and how to structure cues for maximum usefulness.',
    category: 'Live Sound',
  },
  {
    slug: 'bpm-time-signature-basics',
    title: 'BPM and Time Signature Basics for Live Performance',
    description:
      'A practical guide to BPM, time signatures, and tempo. Learn how to count beats, read time signatures, and set the right tempo for your songs.',
    category: 'Fundamentals',
  },
];

export default function ArticlesPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav />
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <header className="mb-12">
            <p className="font-mono text-xs text-accent uppercase tracking-wider mb-4">
              Resources
            </p>
            <h1 className="font-display text-4xl sm:text-5xl mb-4">Articles</h1>
            <p className="font-body text-lg text-zinc-400">
              Practical guides for live musicians who use click tracks, cue tracks, and IEMs.
            </p>
          </header>

          <div className="space-y-6">
            {ARTICLES.map((article) => (
              <Link
                key={article.slug}
                href={`/articles/${article.slug}`}
                className="block group"
              >
                <div className="bg-zinc-950-raised border border-surface-border rounded-lg p-8 transition-colors hover:border-accent/30">
                  <p className="font-mono text-xs text-accent uppercase tracking-wider mb-3">
                    {article.category}
                  </p>
                  <h2 className="font-display text-2xl mb-3 group-hover:text-accent transition-colors">
                    {article.title}
                  </h2>
                  <p className="font-body text-zinc-400 leading-relaxed">
                    {article.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
