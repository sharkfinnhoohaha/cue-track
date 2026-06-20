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
      <div className="border-b border-white/10 bg-black">
        <section className="px-6 pt-32 pb-24 text-center">
          <p className="font-sans text-[10px] tracking-[0.2em] uppercase text-accent mb-6 font-semibold">
            Click &amp; cue tracks for live musicians
          </p>

          <h1 className="font-sans font-extrabold tracking-tight leading-[1.1] text-white max-w-[880px] mx-auto mb-8 text-[clamp(36px,5.5vw,64px)]">
            Analyze your track.<br />
            Get a cue-track back.
          </h1>

          <p className="text-base text-zinc-400 max-w-[540px] mx-auto mb-12 leading-relaxed">
            Drop your song. We&apos;ll match it with a click track and spoken
            cues. No DAW, no music theory required.
          </p>

          <UploadForm />

          <div className="mt-8 flex flex-col items-center gap-4">
            <DemoPlayer />
            <p className="text-xs text-zinc-500 tracking-wide">
              Your first analysis is free &nbsp;·&nbsp; no signup required
            </p>
          </div>
        </section>
      </div>

      {/* ── Manual mode (secondary, demoted) ── */}
      <div id="manual" className="border-b border-white/10 bg-surface-raised">
        <section className="max-w-3xl mx-auto px-6 py-20 text-center">
          <span className="font-sans text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-4 block">
            Or build manually
          </span>
          <h2 className="font-sans font-bold tracking-tight text-white mb-4 text-2xl md:text-3xl">
            Know your BPM? Skip the upload.
          </h2>
          <p className="text-sm text-zinc-400 max-w-[480px] mx-auto leading-relaxed mb-8">
            Enter your tempo, sections, and click sound directly — handy when
            you&apos;re charting a song from scratch.
          </p>
          <Link
            href="/create?mode=manual"
            className="inline-flex items-center px-6 py-2.5 bg-transparent border border-white/20 text-white text-xs font-sans font-semibold rounded-full hover:bg-white/[0.05] transition-all"
          >
            Open manual mode
          </Link>
        </section>
      </div>

      {/* ── How it Works ── */}
      <div id="how-it-works" className="border-b border-white/10 bg-black">
        <section className="max-w-[1080px] mx-auto px-6 py-24">
          <span className="font-sans text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-4 block font-semibold">
            How it works
          </span>
          <h2 className="font-sans font-bold tracking-tight text-white mb-12 text-2xl md:text-3xl">
            Three steps to stage-ready.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.num} className="card p-8 bg-zinc-900/10">
                <span className="font-mono text-xs tracking-wider text-accent mb-6 block font-bold">
                  {step.num}
                </span>
                <div className="font-sans font-bold tracking-tight text-white mb-3 text-lg">
                  {step.title}
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed font-normal">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Features ── */}
      <div className="border-b border-white/10 bg-surface-raised">
        <section className="max-w-[1080px] mx-auto px-6 py-24">
          <span className="font-sans text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-4 block font-semibold">
            Capabilities
          </span>
          <h2 className="font-sans font-bold tracking-tight text-white mb-4 text-2xl md:text-3xl">
            Built for the stage.
          </h2>
          <p className="text-sm text-zinc-400 mb-12 max-w-sm font-normal">
            Every feature exists because a musician needed it.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.key} className="card p-8 bg-black/40">
                <span className="font-mono text-[10px] tracking-wider uppercase text-accent mb-4 block font-bold">
                  {f.key}
                </span>
                <div className="font-sans font-bold tracking-tight text-white mb-2 text-sm">
                  {f.title}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed font-normal">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Pricing ── */}
      <div className="border-b border-white/10 bg-black">
        <section className="max-w-[1080px] mx-auto px-6 py-24">
          <span className="font-sans text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-4 block font-semibold">
            Pricing
          </span>
          <h2 className="font-sans font-bold tracking-tight text-white mb-4 text-2xl md:text-3xl">
            Simple, honest pricing.
          </h2>
          <p className="text-sm text-zinc-400 mb-12 font-normal">No subscription tricks. Choose what works.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[680px]">
            <div className="card p-8 bg-zinc-900/10 relative flex flex-col justify-between">
              <div>
                <span className="font-mono text-[10px] tracking-wider uppercase text-zinc-500 mb-4 block font-bold">
                  Per Track
                </span>
                <div className="font-sans text-4xl font-extrabold text-white leading-none mb-2">
                  $3
                </div>
                <span className="font-mono text-[9px] text-zinc-500 tracking-[0.1em] uppercase mb-6 block font-semibold">
                  one-time · no account
                </span>
                <p className="text-sm text-zinc-400 leading-relaxed mb-8 font-normal">
                  Pay per download. No subscription needed.
                </p>
              </div>
              <Link
                href="/create"
                className="flex items-center justify-center w-full py-2.5 text-xs font-sans font-semibold rounded-full border border-white/20 text-white hover:bg-white/5 hover:border-white transition-all"
              >
                Get Started
              </Link>
            </div>

            <div className="card p-8 bg-zinc-900/10 relative flex flex-col justify-between">
              <div className="absolute top-4 right-4">
                <span className="bg-accent text-white font-sans text-[9px] font-bold uppercase px-2.5 py-1 rounded-full tracking-wider">
                  Popular
                </span>
              </div>
              <div>
                <span className="font-mono text-[10px] tracking-wider uppercase text-accent mb-4 block font-bold">
                  Pro
                </span>
                <div className="font-sans text-4xl font-extrabold text-white leading-none mb-2">
                  $19
                </div>
                <span className="font-mono text-[9px] text-zinc-500 tracking-[0.1em] uppercase mb-6 block font-semibold">
                  per month · unlimited
                </span>
                <p className="text-sm text-zinc-400 leading-relaxed mb-8 font-normal">
                  Unlimited downloads, saved presets, and Studio voices.
                </p>
              </div>
              <Link
                href="/pricing"
                className="flex items-center justify-center w-full py-2.5 text-xs font-sans font-semibold rounded-full bg-white text-black hover:bg-zinc-200 transition-all"
              >
                Go Pro
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ── CTA ── */}
      <section className="px-6 py-28 text-center bg-black">
        <h2 className="font-sans font-bold tracking-tight text-white max-w-[660px] mx-auto mb-6 text-[clamp(28px,4vw,48px)] leading-[1.1]">
          Your cue track, ready in minutes.
        </h2>
        <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-10 leading-relaxed font-normal">
          Drop your track and skip the busywork — no DAW, no charting, no
          fiddling with a metronome.
        </p>
        <Link
          href="/create"
          className="inline-flex items-center px-8 py-3 bg-white text-black text-xs font-sans font-semibold rounded-full hover:bg-zinc-200 transition-all"
        >
          Try it now
        </Link>
      </section>

      <Footer />
    </>
  );
}
