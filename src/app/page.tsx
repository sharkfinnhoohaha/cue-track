import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

// ─── Static data ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: '01',
    title: 'Specify',
    desc: 'BPM, time signature, song structure. Drag sections. Pick a voice and click sound.',
  },
  {
    num: '02',
    title: 'Generate',
    desc: 'Sample-accurate rendering with spoken cues placed one bar before each transition.',
  },
  {
    num: '03',
    title: 'Perform',
    desc: 'Download WAV or MP3. Load into any playback app, IEM rig, or DAW.',
  },
];

const FEATURES = [
  { key: 'Click',   title: 'Sample-accurate',        desc: 'Zero drift at any tempo. 60 to 240 BPM.' },
  { key: 'Voice',   title: 'Spoken section cues',     desc: 'Google Cloud TTS announces each section one bar early.' },
  { key: 'Time',    title: 'Any time signature',      desc: '4/4, 3/4, 6/8, 7/8, 5/4, or custom. Mixed meters supported.' },
  { key: 'Count',   title: 'Count-ins and countdowns', desc: 'Spoken count-ins at section starts, with optional bar countdowns.' },
  { key: 'Format',  title: 'WAV and MP3',             desc: '16-bit 44.1kHz WAV or 192kbps MP3. Your choice.' },
  { key: 'Preview', title: 'Free 15-second preview',  desc: 'Listen before you buy. Make sure it sounds right.' },
];

const DEMO_TAGS = ['120 BPM', '4/4', 'Classic Click', 'Intro → Chorus → Outro'];

// Pre-computed waveform heights — deterministic, safe for SSR
const WAVEFORM_BARS = Array.from({ length: 110 }, (_, i) => ({
  height: Math.max(5, Math.abs(Math.sin(i * 0.2) * Math.cos(i * 0.09)) * 36 + 5),
  played: i / 110 < 0.26,
}));

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <Nav />

      {/* ── Hero ── */}
      <div className="border-b border-black/[.08]">
        <section className="px-6 pt-[152px] pb-24 text-center">
          <p className="font-mono text-[11px] tracking-[.12em] uppercase text-[#6e6e73] mb-6">
            Click &amp; cue tracks for live musicians
          </p>

          <h1 className="font-sans font-black tracking-[-0.04em] leading-[1.0] text-[#1d1d1f] max-w-[860px] mx-auto mb-6 text-[clamp(48px,7.5vw,96px)]">
            Your song.<br />
            Your tempo.<br />
            <span className="text-[#6e6e73]">Their cue.</span>
          </h1>

          <p className="text-[19px] text-[#6e6e73] max-w-[440px] mx-auto mb-10 leading-[1.55] font-normal">
            Spec a song, get a studio-quality click track with spoken section cues.
            No DAW. No catalog lock-in.
          </p>

          <div className="flex items-center justify-center gap-6 mb-5">
            <Link
              href="/create"
              className="inline-flex items-center px-7 py-3 bg-[#1d1d1f] text-[#f5f5f7] text-[15px] font-semibold rounded-full hover:opacity-80 transition-opacity"
            >
              Create a Track
            </Link>
            <a
              href="#how-it-works"
              className="text-[15px] font-medium text-[#0066cc] hover:opacity-75 transition-opacity"
            >
              See how it works ↓
            </a>
          </div>

          <p className="font-mono text-[11px] text-[#b0b0b5] tracking-[.08em]">
            $3 per track &nbsp;·&nbsp; $19 / mo unlimited
          </p>

          {/* Waveform demo */}
          <div className="max-w-[760px] mx-auto mt-16 bg-white border border-black/[.08] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-black/[.08] flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {DEMO_TAGS.map((tag) => (
                  <span
                    key={tag}
                    className="font-mono text-[10px] tracking-[.08em] uppercase text-[#6e6e73] bg-[#f5f5f7] border border-black/[.08] rounded px-1.5 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <span className="font-mono text-[11px] text-[#b0b0b5] tracking-[.06em] flex-shrink-0 ml-3">
                Preview · 0:15
              </span>
            </div>
            <div className="px-5 py-6 flex items-center gap-3.5">
              <button
                className="flex-shrink-0 w-8 h-8 bg-[#1d1d1f] text-[#f5f5f7] rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                aria-label="Play preview"
              >
                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
                  <path d="M0 0l10 6-10 6V0z" />
                </svg>
              </button>
              <div className="flex-1 h-10 flex items-center gap-0.5 overflow-hidden">
                {WAVEFORM_BARS.map((bar, i) => (
                  <span
                    key={i}
                    className={`block w-[3px] rounded-sm flex-shrink-0 ${
                      bar.played ? 'bg-[#1d1d1f]' : 'bg-black/[.1]'
                    }`}
                    style={{ height: `${bar.height}px` }}
                  />
                ))}
              </div>
              <span className="font-mono text-[11px] text-[#b0b0b5] flex-shrink-0 tracking-[.06em]">
                0:04 / 0:15
              </span>
            </div>
          </div>
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
            {/* Per track */}
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

            {/* Pro */}
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
                Unlimited downloads and saved presets.
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
        <p className="text-[17px] text-[#6e6e73] max-w-[340px] mx-auto mb-9 leading-[1.55]">
          Spec your song. Pick a voice. Download the track.
        </p>
        <Link
          href="/create"
          className="inline-flex items-center px-7 py-3 bg-[#1d1d1f] text-[#f5f5f7] text-[15px] font-semibold rounded-full hover:opacity-80 transition-opacity"
        >
          Create Your First Track
        </Link>
      </section>

      <Footer />
    </>
  );
}
