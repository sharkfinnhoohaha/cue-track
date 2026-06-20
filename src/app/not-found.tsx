import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-xl px-6 pt-32 pb-24 text-center">
        <p className="font-mono text-[11px] tracking-[.12em] uppercase text-zinc-400 mb-4">
          404
        </p>
        <h1 className="font-display font-bold tracking-[-0.035em] text-zinc-100 text-[clamp(28px,4vw,44px)] mb-4">
          We couldn&apos;t find that page.
        </h1>
        <p className="text-[15px] text-zinc-400 leading-[1.6] mb-9">
          The link may be broken, or the track may have been removed. Let&apos;s get you
          back on track.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-accent px-7 py-3 text-[14px] font-bold text-zinc-950 hover:opacity-90 transition-opacity"
          >
            Go home
          </Link>
          <Link
            href="/create"
            className="inline-flex items-center rounded-full border border-white/[.12] px-7 py-3 text-[14px] font-semibold text-zinc-100 hover:opacity-70 transition-opacity"
          >
            Create a track
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
