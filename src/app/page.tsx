import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface text-white">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-24 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-accent-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <p className="font-mono text-xs tracking-[0.3em] uppercase text-accent-500 mb-6">
            For drummers, worship leaders, and musical directors
          </p>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl leading-[1.05] mb-8 tracking-tight">
            Click tracks that speak
            <br />
            <span className="text-accent-500">your language</span>
          </h1>
          <p className="font-body text-lg sm:text-xl text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Spec a song in two minutes, get a downloadable click track with
            spoken cue announcements, count-ins, and section countdowns.
            No DAW required. No catalog subscription. Just your song, your way.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 bg-accent-500 text-black font-mono text-sm font-semibold px-8 py-4 rounded hover:bg-accent-400 transition-colors"
            >
              Create a Track
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center font-mono text-sm text-neutral-400 hover:text-white transition-colors px-6 py-4"
            >
              $3 per track · $19/mo unlimited
            </Link>
          </div>
        </div>
      </section>

      {/* Audio Demo */}
      <section className="px-6 pb-20">
        <div className="max-w-2xl mx-auto">
          <div className="bg-surface-raised border border-surface-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
              <span className="font-mono text-xs text-muted uppercase tracking-wider">
                Demo: 120 BPM · 4/4 · Intro → Verse → Chorus → Bridge → Outro
              </span>
            </div>
            {/* Waveform visualization */}
            <div className="h-16 mb-4 flex items-center gap-[2px]">
              {Array.from({ length: 80 }).map((_, i) => {
                const height = Math.abs(Math.sin(i * 0.15) * Math.cos(i * 0.08)) * 100;
                const minHeight = 8;
                const barHeight = Math.max(minHeight, height);
                return (
                  <div
                    key={i}
                    className="flex-1 bg-accent-500/30 rounded-full"
                    style={{ height: `${barHeight}%` }}
                  />
                );
              })}
            </div>
            <audio
              controls
              className="w-full h-10 [&::-webkit-media-controls-panel]:bg-surface-raised"
              preload="none"
            >
              <source src="/api/demo-preview" type="audio/wav" />
              Your browser does not support the audio element.
            </audio>
            <p className="font-mono text-xs text-muted mt-3">
              15-second preview with classic click, section announcements, and count-in
            </p>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="px-6 py-20 border-t border-surface-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl sm:text-4xl text-center mb-16">
            Three steps to stage-ready
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: '01',
                title: 'Specify',
                description:
                  'Enter your BPM, time signature, and song structure. Drag sections to reorder. Pick a voice and click sound.',
              },
              {
                step: '02',
                title: 'Generate',
                description:
                  'Our engine renders a sample-accurate click track with spoken cue announcements placed one bar before each transition.',
              },
              {
                step: '03',
                title: 'Perform',
                description:
                  'Download your WAV or MP3. Load it into any playback app, IEM rig, or DAW. Your band hears every cue.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center md:text-left">
                <span className="font-mono text-accent-500 text-sm mb-3 block">
                  {item.step}
                </span>
                <h3 className="font-display text-2xl mb-3">{item.title}</h3>
                <p className="font-body text-neutral-400 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 bg-surface-raised border-t border-surface-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl sm:text-4xl text-center mb-4">
            Built for the stage
          </h2>
          <p className="font-body text-neutral-400 text-center max-w-2xl mx-auto mb-16">
            Every feature exists because a musician needed it during rehearsal or performance.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: '◎',
                title: 'Sample-accurate clicks',
                description:
                  'Zero drift. Every click lands on the exact sample position, whether your song is 60 BPM or 240.',
              },
              {
                icon: '◈',
                title: 'Spoken section cues',
                description:
                  'Google Cloud voices announce "Verse," "Chorus," "Bridge" one bar before each transition.',
              },
              {
                icon: '▦',
                title: 'Any time signature',
                description:
                  '4/4, 3/4, 6/8, 7/8, 5/4, or custom. Mixed meters across sections. Your song, your rules.',
              },
              {
                icon: '⬡',
                title: 'Count-ins and countdowns',
                description:
                  'Spoken count-ins at section starts. Optional bar countdowns: "4 bars," "3 bars," "2 bars."',
              },
              {
                icon: '⊞',
                title: 'WAV and MP3',
                description:
                  '16-bit 44.1kHz WAV for studio quality, or 192kbps MP3 for smaller file sizes. Your choice.',
              },
              {
                icon: '◇',
                title: 'Instant preview',
                description:
                  'Hear a free 15-second preview before you buy. Make sure it sounds right before downloading.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-surface border border-surface-border rounded-lg p-6"
              >
                <span className="text-accent-500 text-xl block mb-3">
                  {feature.icon}
                </span>
                <h3 className="font-mono text-sm font-semibold mb-2">
                  {feature.title}
                </h3>
                <p className="font-body text-sm text-neutral-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="px-6 py-20 border-t border-surface-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl sm:text-4xl text-center mb-16">
            Made for musicians who run the show
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                role: 'Worship Leaders',
                description:
                  'Build click tracks for originals and obscure songs that aren\'t in Loop Community or MultiTracks catalogs. No DAW expertise needed.',
              },
              {
                role: 'Drummers',
                description:
                  'Lock in your tempo with a click that actually sounds good in your IEMs. Classic, woodblock, rimshot, or hi-hat.',
              },
              {
                role: 'Musical Directors',
                description:
                  'Give your band spoken cue tracks for complex arrangements with multiple transitions, tempo changes, and time signature shifts.',
              },
              {
                role: 'Indie Band Leaders',
                description:
                  'Rehearse and perform with click and cue tracks without paying $30/month for a catalog you\'ll barely use.',
              },
            ].map((useCase) => (
              <div
                key={useCase.role}
                className="border border-surface-border rounded-lg p-8"
              >
                <h3 className="font-mono text-sm text-accent-500 uppercase tracking-wider mb-3">
                  {useCase.role}
                </h3>
                <p className="font-body text-neutral-300 leading-relaxed">
                  {useCase.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="px-6 py-20 bg-surface-raised border-t border-surface-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl sm:text-4xl mb-4">
            Simple, honest pricing
          </h2>
          <p className="font-body text-neutral-400 mb-10">
            Pay per track or go unlimited. No hidden fees, no account required for single purchases.
          </p>
          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="bg-surface border border-surface-border rounded-lg p-8">
              <p className="font-mono text-xs text-muted uppercase tracking-wider mb-2">
                Per Track
              </p>
              <p className="font-display text-4xl mb-2">
                $3
              </p>
              <p className="font-body text-sm text-neutral-400 mb-6">
                One-time payment, no account needed
              </p>
              <Link
                href="/create"
                className="block w-full text-center font-mono text-sm border border-surface-border text-white py-3 rounded hover:border-accent-500 transition-colors"
              >
                Get Started
              </Link>
            </div>
            <div className="bg-surface border border-accent-500/30 rounded-lg p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="font-mono text-xs bg-accent-500 text-black px-3 py-1 rounded-full">
                  Best Value
                </span>
              </div>
              <p className="font-mono text-xs text-muted uppercase tracking-wider mb-2">
                Pro
              </p>
              <p className="font-display text-4xl mb-2">
                $19<span className="text-lg text-muted">/mo</span>
              </p>
              <p className="font-body text-sm text-neutral-400 mb-6">
                Unlimited downloads, saved presets
              </p>
              <Link
                href="/pricing"
                className="block w-full text-center font-mono text-sm bg-accent-500 text-black py-3 rounded hover:bg-accent-400 transition-colors"
              >
                Go Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24 border-t border-surface-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl sm:text-4xl mb-6">
            Your band deserves better than a beeping metronome
          </h2>
          <p className="font-body text-neutral-400 mb-10 max-w-xl mx-auto">
            Spec your song. Pick a voice. Download a click track that tells your
            band exactly what's coming next.
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 bg-accent-500 text-black font-mono text-sm font-semibold px-8 py-4 rounded hover:bg-accent-400 transition-colors"
          >
            Create Your First Track
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
