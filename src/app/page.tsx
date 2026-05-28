import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { UploadForm } from '@/components/upload-form';

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
      <div className="border-b border-black/[.08]">
        <section className="px-6 pt-[112px] pb-20 text-center">
          <p className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-6">
            Click &amp; cue tracks for live musicians
          </p>

          <h1 className="font-sans font-black tracking-[-0.04em] leading-[1.0] text-[#1d1d1f] max-w-[860px] mx-auto mb-5 text-[clamp(44px,7vw,84px)]">
            Analyze your track.<br />
            Get a cue-track back.
          </h1>

          <p className="text-[18px] text-[#6e6e73] max-w-[480px] mx-auto mb-10 leading-[1.55] font-normal">
            Drop your song. We&apos;ll match it with a click track and spoken
            cues. No DAW, no music theory required.
          </p>

          <UploadForm />

          <p className="font-mono text-[11px] text-[#b0b0b5] tracking-[.08em] mt-5">
            Your first analysis is free &nbsp;·&nbsp; no signup required
          </p>
        </section>
      </div>

      {/* ── Manual mode (secondary, demoted) ── */}
      <div id="manual" className="border-b border-black/[.08] bg-[#fafafa]">
        <section className="max-w-3xl mx-auto px-6 py-20 text-center">
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-3 block">
            Or build manually
          </span>
          <h2 className="font-sans font-black tracking-[-0.035em] text-[#1d1d1f] mb-3 text-[clamp(26px,3.2vw,38px)]">
            Know your BPM? Skip the upload.
          </h2>
          <p className="text-[15px] text-[#6e6e73] max-w-[480px] mx-auto leading-[1.6] mb-7">
            Enter your tempo, sections, and click sound directly — handy when
            you&apos;re charting a song from scratch.
          </p>
          <Link
            href="/create?mode=manual"
            className="inline-flex items-center px-6 py-3 bg-white border border-black/[.13] text-[#1d1d1f] text-[14px] font-semibold rounded-full hover:opacity-75 transition-opacity"
          >
            Open manual mode
          </Link>
        </section>
      </div>

      {/* ── How it Works ── */}
      <div id="how-it-works" className="border-b border-black/[.08]">
        <section className="max-w-[1080px] mx-auto px-6 py-[100px]">
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-3.5 block">
            How it works
          </span>
          <h2 className="font-sans font-black tracking-[-0.035em] text-[#1d1d1f] mb-14 text-[clamp(28px,3.5vw,44px)]">
            Three steps to stage-ready.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-black/[.08] border border-black/[.08] rounded-[14px] overflow-hidden">
            {STEPS.map((step) => (
              <div key={step.num} className="bg-white p-10">
                <span className="font-mono text-[11px] tracking-[.12em] uppercase text-[#b0b0b5] mb-5 block">
                  {step.num}
                </span>
                <div className="text-[20px] font-bold tracking-[-0.025em] text-[#1d1d1f] mb-2.5">
                  {step.title}
                </div>
                <p className="text-[14px] text-[#6e6e73] leading-[1.65]">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Features ── */}
      <div className="border-b border-black/[.08]">
        <section className="max-w-[1080px] mx-auto px-6 py-[100px]">
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-3.5 block">
            Capabilities
          </span>
          <h2 className="font-sans font-black tracking-[-0.035em] text-[#1d1d1f] mb-3 text-[clamp(28px,3.5vw,44px)]">
            Built for the stage.
          </h2>
          <p className="text-[17px] text-[#6e6e73] mb-14 max-w-[360px]">
            Every feature exists because a musician needed it.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-black/[.08] border border-black/[.08] rounded-[14px] overflow-hidden">
            {FEATURES.map((f) => (
              <div key={f.key} className="bg-white p-8">
                <span className="font-mono text-[10px] tracking-[.12em] uppercase text-[#b0b0b5] mb-3.5 block">
                  {f.key}
                </span>
                <div className="text-[15px] font-semibold tracking-[-0.02em] text-[#1d1d1f] mb-1.5">
                  {f.title}
                </div>
                <p className="text-[13px] text-[#6e6e73] leading-[1.6]">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Pricing ── */}
      <div className="border-b border-black/[.08]">
        <section className="max-w-[1080px] mx-auto px-6 py-[100px]">
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-3.5 block">
            Pricing
          </span>
          <h2 className="font-sans font-black tracking-[-0.035em] text-[#1d1d1f] mb-3 text-[clamp(28px,3.5vw,44px)]">
            Simple, honest pricing.
          </h2>
          <p className="text-[17px] text-[#6e6e73] mb-14">No hidden fees.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[640px]">
            <div className="bg-white border border-black/[.08] rounded-[14px] p-9">
              <span className="font-mono text-[10px] tracking-[.12em] uppercase text-[#b0b0b5] mb-[18px] block">
                Per Track
              </span>
              <div className="font-mono text-[44px] font-semibold tracking-[-0.04em] text-[#1d1d1f] leading-none mb-1">
                $3
              </div>
              <span className="font-mono text-[11px] text-[#6e6e73] tracking-[.04em] mb-5 block">
                one-time · no account
              </span>
              <p className="text-[13px] text-[#6e6e73] leading-[1.6] mb-7">
                Pay per download. No subscription needed.
              </p>
              <Link
                href="/create"
                className="flex items-center justify-center w-full py-2.5 text-[14px] font-semibold rounded-lg border border-black/[.13] text-[#1d1d1f] hover:opacity-70 transition-opacity"
              >
                Get Started
              </Link>
            </div>

            <div className="bg-[#1d1d1f] rounded-[14px] p-9">
              <span className="font-mono text-[10px] tracking-[.12em] uppercase text-white/40 mb-[18px] block">
                Pro
              </span>
              <div className="font-mono text-[44px] font-semibold tracking-[-0.04em] text-white leading-none mb-1">
                $19
              </div>
              <span className="font-mono text-[11px] text-white/50 tracking-[.04em] mb-5 block">
                per month · unlimited
              </span>
              <p className="text-[13px] text-white/60 leading-[1.6] mb-7">
                Unlimited downloads, saved presets, and Studio voices.
              </p>
              <Link
                href="/pricing"
                className="flex items-center justify-center w-full py-2.5 text-[14px] font-semibold rounded-lg border border-white/20 text-white hover:opacity-75 transition-opacity"
              >
                Go Pro
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ── CTA ── */}
      <section className="px-6 py-[120px] text-center">
        <h2 className="font-sans font-black tracking-[-0.04em] leading-[1.05] text-[#1d1d1f] max-w-[640px] mx-auto mb-5 text-[clamp(32px,4.5vw,56px)]">
          Your band deserves better than a beeping metronome.
        </h2>
        <p className="text-[17px] text-[#6e6e73] max-w-[360px] mx-auto mb-9 leading-[1.55]">
          Drop your track. Get a cue-track back.
        </p>
        <Link
          href="/create"
          className="inline-flex items-center px-7 py-3 bg-[#1d1d1f] text-[#f5f5f7] text-[15px] font-semibold rounded-full hover:opacity-80 transition-opacity"
        >
          Try it now
        </Link>
      </section>

      <Footer />
    </>
  );
}
