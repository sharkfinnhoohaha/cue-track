import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { UploadForm } from '@/components/upload-form';
import { DemoPlayer } from '@/components/demo-player';

const STEPS = [
  {
    num: '01',
    title: 'Upload',
    desc: 'Drop your MP3 or WAV. We detect tempo and song length.',
  },
  {
    num: '02',
    title: 'Confirm',
    desc: 'Adjust the structure if needed. Pick a voice and click sound.',
  },
  {
    num: '03',
    title: 'Perform',
    desc: 'Download WAV or MP3. Load into any playback app, IEM rig, or DAW.',
  },
];

const FEATURES = [
  { key: 'Click',   title: 'Sample-accurate',         desc: 'Zero drift at any tempo. 60 to 240 BPM.' },
  { key: 'Voice',   title: 'Spoken section cues',     desc: 'Google Cloud TTS announces each section one bar early.' },
  { key: 'Time',    title: 'Any time signature',      desc: '4/4, 3/4, 6/8, 7/8, 5/4, or custom. Mixed meters supported.' },
  { key: 'Count',   title: 'Count-ins and countdowns', desc: 'Spoken count-ins at section starts, with optional bar countdowns.' },
  { key: 'Format',  title: 'WAV and MP3',             desc: '16-bit 44.1kHz WAV or 192kbps MP3. Your choice.' },
  { key: 'Preview', title: 'Free preview',            desc: 'Listen before you buy. Make sure it sounds right.' },
];

/**
 * Landing page — primary entry point.
 *
 * Upload-first: the hero leads with the headline product (drop your audio,
 * get a cue track curated to it) via the live UploadForm. The full guided
 * create flow lives on /create. Manual mode (enter BPM + sections by hand)
 * is a demoted, secondary path linked from the "build manually" section
 * below — it no longer renders the full form inline for first-time visitors.
 */
export default function HomePage() {
  return (
    <>
      <Nav />

      {/* ── Hero ── */}
      <div className="border-b border-white/[.08] bg-gradient-to-b from-zinc-950 to-zinc-900">
        <section className="px-6 pt-[128px] pb-24 text-center">
          <p className="font-mono text-[11px] tracking-[.12em] uppercase text-accent mb-6 font-semibold">
            Click &amp; cue tracks for live musicians
          </p>

          <h1 className="font-display font-bold tracking-[-0.025em] leading-[1.02] text-zinc-100 max-w-[880px] mx-auto mb-5 text-[clamp(40px,6.4vw,76px)]">
            Analyze your track.<br />
            Get a cue-track back.
          </h1>

          <p className="text-[18px] text-zinc-400 max-w-[480px] mx-auto mb-10 leading-[1.55] font-normal">
            Drop your song. We&apos;ll match it with a click track and spoken
            cues. No DAW, no music theory required.
          </p>

          <UploadForm />

          <div className="mt-6 flex flex-col items-center gap-3">
            <DemoPlayer />
            <p className="font-mono text-[11px] text-zinc-500 tracking-[.08em]">
              Your first analysis is free &nbsp;·&nbsp; no signup required
            </p>
          </div>
        </section>
      </div>

      {/* ── Manual mode (secondary, demoted) ── */}
      <div id="manual" className="border-b border-white/[.08] bg-zinc-900/30">
        <section className="max-w-3xl mx-auto px-6 py-20 text-center">
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-zinc-500 mb-3 block">
            Or build manually
          </span>
          <h2 className="font-display font-bold tracking-[-0.02em] text-zinc-100 mb-3 text-[clamp(24px,3vw,36px)]">
            Know your BPM? Skip the upload.
          </h2>
          <p className="text-[15px] text-zinc-400 max-w-[480px] mx-auto leading-[1.6] mb-7">
            Enter your tempo, sections, and click sound directly — handy when
            you&apos;re charting a song from scratch.
          </p>
          <Link
            href="/create?mode=manual"
            className="inline-flex items-center px-6 py-3 bg-zinc-900 border border-white/[.08] text-zinc-100 text-[14px] font-semibold rounded-full hover:bg-white/[.04] transition-all"
          >
            Open manual mode
          </Link>
        </section>
      </div>

      {/* ── How it Works ── */}
      <div id="how-it-works" className="border-b border-white/[.08] bg-zinc-950">
        <section className="max-w-[1080px] mx-auto px-6 py-[100px]">
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-zinc-500 mb-3.5 block">
            How it works
          </span>
          <h2 className="font-display font-bold tracking-[-0.02em] text-zinc-100 mb-14 text-[clamp(26px,3.2vw,40px)]">
            Three steps to stage-ready.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[.08] border border-white/[.08] rounded-[14px] overflow-hidden">
            {STEPS.map((step) => (
              <div key={step.num} className="bg-zinc-900/90 p-10">
                <span className="font-mono text-[11px] tracking-[.12em] uppercase text-accent mb-5 block font-medium">
                  {step.num}
                </span>
                <div className="text-[20px] font-bold tracking-[-0.025em] text-zinc-100 mb-2.5">
                  {step.title}
                </div>
                <p className="text-[14px] text-zinc-400 leading-[1.65]">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Features ── */}
      <div className="border-b border-white/[.08] bg-zinc-900/10">
        <section className="max-w-[1080px] mx-auto px-6 py-[100px]">
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-zinc-500 mb-3.5 block">
            Capabilities
          </span>
          <h2 className="font-display font-bold tracking-[-0.02em] text-zinc-100 mb-3 text-[clamp(26px,3.2vw,40px)]">
            Built for the stage.
          </h2>
          <p className="text-[17px] text-zinc-400 mb-14 max-w-[360px]">
            Every feature exists because a musician needed it.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[.08] border border-white/[.08] rounded-[14px] overflow-hidden">
            {FEATURES.map((f) => (
              <div key={f.key} className="bg-zinc-900/90 p-8">
                <span className="font-mono text-[10px] tracking-[.12em] uppercase text-accent mb-3.5 block font-medium">
                  {f.key}
                </span>
                <div className="text-[15px] font-semibold tracking-[-0.02em] text-zinc-100 mb-1.5">
                  {f.title}
                </div>
                <p className="text-[13px] text-zinc-400 leading-[1.6]">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Pricing ── */}
      <div className="border-b border-white/[.08] bg-zinc-950">
        <section className="max-w-[1080px] mx-auto px-6 py-[100px]">
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-zinc-500 mb-3.5 block">
            Pricing
          </span>
          <h2 className="font-display font-bold tracking-[-0.02em] text-zinc-100 mb-3 text-[clamp(26px,3.2vw,40px)]">
            Simple, honest pricing.
          </h2>
          <p className="text-[17px] text-zinc-400 mb-14">No hidden fees.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[640px]">
            <div className="bg-zinc-900 border border-white/[.08] rounded-[14px] p-9">
              <span className="font-mono text-[10px] tracking-[.12em] uppercase text-zinc-500 mb-[18px] block">
                Per Track
              </span>
              <div className="font-mono text-[44px] font-semibold tracking-[-0.04em] text-zinc-100 leading-none mb-1">
                $3
              </div>
              <span className="font-mono text-[11px] text-zinc-400 tracking-[.04em] mb-5 block">
                one-time · no account
              </span>
              <p className="text-[13px] text-zinc-400 leading-[1.6] mb-7">
                Pay per download. No subscription needed.
              </p>
              <Link
                href="/create"
                className="flex items-center justify-center w-full py-2.5 text-[14px] font-semibold rounded-lg border border-white/[.12] text-zinc-100 hover:bg-white/[.04] transition-all"
              >
                Get Started
              </Link>
            </div>

            <div className="bg-zinc-900 border border-accent/30 rounded-[14px] p-9 relative glow-accent">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-accent text-zinc-950 font-mono text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                  Popular
                </span>
              </div>
              <span className="font-mono text-[10px] tracking-[.12em] uppercase text-accent mb-[18px] block font-semibold">
                Pro
              </span>
              <div className="font-mono text-[44px] font-semibold tracking-[-0.04em] text-zinc-100 leading-none mb-1">
                $19
              </div>
              <span className="font-mono text-[11px] text-zinc-400 tracking-[.04em] mb-5 block">
                per month · unlimited
              </span>
              <p className="text-[13px] text-zinc-400 leading-[1.6] mb-7">
                Unlimited downloads, saved presets, and Studio voices.
              </p>
              <Link
                href="/pricing"
                className="flex items-center justify-center w-full py-2.5 text-[14px] font-bold rounded-lg bg-accent text-zinc-950 hover:opacity-90 transition-opacity"
              >
                Go Pro
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ── CTA ── */}
      <section className="px-6 py-[120px] text-center bg-gradient-to-b from-zinc-950 to-zinc-900">
        <h2 className="font-display font-bold tracking-[-0.025em] leading-[1.05] text-zinc-100 max-w-[660px] mx-auto mb-5 text-[clamp(30px,4.2vw,52px)]">
          Your cue track, ready in minutes.
        </h2>
        <p className="text-[17px] text-zinc-400 max-w-[400px] mx-auto mb-9 leading-[1.55]">
          Drop your track and skip the busywork — no DAW, no charting, no
          fiddling with a metronome.
        </p>
        <Link
          href="/create"
          className="inline-flex items-center px-7 py-3 bg-accent text-zinc-950 text-[15px] font-bold rounded-full hover:opacity-90 transition-opacity glow-accent"
        >
          Try it now
        </Link>
      </section>

      <Footer />
    </>
  );
}
