import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'BPM and Time Signature Basics for Live Performance | Cue Track',
  description:
    'A practical guide to BPM, time signatures, and tempo for live musicians. Learn how to count beats, read time signatures, and set the right tempo for your songs.',
  openGraph: {
    title: 'BPM and Time Signature Basics for Live Performance',
    description:
      'A practical guide to BPM, time signatures, and tempo for live musicians.',
    type: 'article',
  },
};

export default function BpmTimeSignatureBasicsPage() {
  return (
    <div className="min-h-screen bg-surface text-white">
      <Nav />
      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-4">
              Fundamentals
            </p>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6">
              BPM and Time Signature Basics for Live Performance
            </h1>
            <p className="font-body text-lg text-neutral-400 leading-relaxed">
              Whether you&apos;re a drummer locking in tempo, a worship leader counting in the band,
              or a musical director building cue tracks, BPM and time signatures are the
              foundation everything else sits on. Here&apos;s what you need to know.
            </p>
          </header>

          <div className="prose-dark space-y-8">
            <section>
              <h2 className="font-display text-2xl mb-4">What BPM actually means</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                BPM stands for beats per minute. It&apos;s the speed of your song measured in
                how many quarter-note pulses happen in 60 seconds. A song at 120 BPM has
                exactly two beats per second. A ballad at 60 BPM has one beat per second.
                A fast punk track at 200 BPM has about 3.3 beats per second.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                BPM is not subjective. It is a precise measurement, and your click track
                needs to match the BPM you intend to play. If you&apos;re not sure what BPM
                your song is, use a tap tempo tool: tap a button in time with the music
                and it will calculate the BPM for you.
              </p>
              <div className="bg-surface-raised border border-surface-border rounded-lg p-6 my-6">
                <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-3">
                  Common BPM ranges
                </p>
                <div className="grid grid-cols-2 gap-3 font-body text-sm text-neutral-300">
                  <div><span className="font-mono text-white">60–80</span> — Ballads, slow worship</div>
                  <div><span className="font-mono text-white">80–100</span> — Moderate groove</div>
                  <div><span className="font-mono text-white">100–120</span> — Pop, modern worship</div>
                  <div><span className="font-mono text-white">120–140</span> — Upbeat rock, dance</div>
                  <div><span className="font-mono text-white">140–170</span> — Fast rock, punk</div>
                  <div><span className="font-mono text-white">170–200+</span> — Double-time, metal</div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Time signatures explained</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                A time signature tells you two things: how many beats are in each bar
                (the top number) and what note value gets one beat (the bottom number).
                In 4/4 time, there are four quarter-note beats per bar. In 3/4, there
                are three. In 6/8, there are six eighth-note beats per bar.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                For click track purposes, the top number determines how many clicks
                you hear per bar, and which click gets the accent. In 4/4, beat 1 is
                accented. In 3/4 (waltz time), beat 1 of every three is accented.
                In 6/8, beats 1 and 4 typically get accents, creating that characteristic
                &quot;ONE-two-three-FOUR-five-six&quot; feel.
              </p>
              <div className="bg-surface-raised border border-surface-border rounded-lg p-6 my-6">
                <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-3">
                  Common time signatures
                </p>
                <div className="space-y-3 font-body text-sm text-neutral-300">
                  <div>
                    <span className="font-mono text-white">4/4</span> —
                    Most pop, rock, worship, and country. Four beats per bar.
                    The default if you&apos;re not sure.
                  </div>
                  <div>
                    <span className="font-mono text-white">3/4</span> —
                    Waltz time. Three beats per bar. Used in ballads and some hymns.
                  </div>
                  <div>
                    <span className="font-mono text-white">6/8</span> —
                    Compound duple. Six eighth-notes per bar, felt in two groups of three.
                    Common in worship (&quot;What a Beautiful Name&quot;) and folk music.
                  </div>
                  <div>
                    <span className="font-mono text-white">7/8</span> —
                    Asymmetric. Seven eighth-notes per bar, usually grouped 2+2+3 or 3+2+2.
                    Progressive rock, some film scores.
                  </div>
                  <div>
                    <span className="font-mono text-white">5/4</span> —
                    Five beats per bar. Think &quot;Take Five&quot; by Dave Brubeck.
                    Unusual but not rare in creative arrangements.
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Why BPM consistency matters live</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                Without a click track, most bands drift in tempo during a live set.
                The opening verse might start at 118 BPM and creep to 125 by the final
                chorus. Nobody notices in the moment, but it creates problems: transitions
                feel rushed, the energy arc of the song shifts unpredictably, and if
                you&apos;re running to tracks or loops, everything falls apart.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                A click track solves this by giving the drummer (or the whole band via IEMs)
                a steady reference pulse. But a bare click only solves tempo. It doesn&apos;t
                tell anyone that the chorus is about to start, or that the bridge is in
                3/4 while the rest of the song is in 4/4.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed">
                That&apos;s where cue tracks come in: spoken announcements layered on top
                of the click that tell the band what&apos;s happening next. &quot;Verse.&quot;
                &quot;Chorus.&quot; &quot;Bridge in four.&quot; Everyone hears it, everyone&apos;s ready.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Setting the right BPM for your song</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                If you&apos;re covering a song, look up the original BPM. Sites like
                SongBPM and GetSongBPM have large databases. But consider adjusting: many
                bands play covers slightly faster or slower to match their energy level
                and skill.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                If you&apos;re playing an original, the best method is to play along with
                a tap tempo until the tempo feels natural. Don&apos;t pick a &quot;nice&quot;
                number like 120 if your song actually wants to be at 117. The click should
                match the song, not the other way around.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed">
                Some songs have intentional tempo changes: an intro at 100 BPM that
                kicks into 120 for the first verse. Advanced click track tools let you
                set per-section BPM overrides so the click follows the song&apos;s natural
                dynamics.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Mapping your song structure</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                Before you build a click track, you need to know your song&apos;s structure
                in bars. Count through each section:
              </p>
              <div className="bg-surface-raised border border-surface-border rounded-lg p-6 my-6">
                <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-3">
                  Example: typical worship song structure
                </p>
                <div className="space-y-1 font-mono text-sm text-neutral-300">
                  <div>Intro .............. <span className="text-white">4 bars</span></div>
                  <div>Verse 1 ............ <span className="text-white">8 bars</span></div>
                  <div>Chorus ............. <span className="text-white">8 bars</span></div>
                  <div>Verse 2 ............ <span className="text-white">8 bars</span></div>
                  <div>Chorus ............. <span className="text-white">8 bars</span></div>
                  <div>Bridge ............. <span className="text-white">4 bars</span></div>
                  <div>Bridge (repeat) .... <span className="text-white">4 bars</span></div>
                  <div>Chorus (final) ..... <span className="text-white">8 bars</span></div>
                  <div>Outro/Tag .......... <span className="text-white">4 bars</span></div>
                </div>
                <p className="font-mono text-xs text-muted mt-3">
                  Total: 56 bars × 4 beats × (60/120 BPM) = 112 seconds ≈ 1:52
                </p>
              </div>
              <p className="font-body text-neutral-300 leading-relaxed">
                Once you have this map, building the click track is straightforward:
                enter the BPM, pick the time signature, add each section with its bar
                count, and let the generator handle the rest.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">The practical shortcut</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                You don&apos;t need a DAW. You don&apos;t need to learn audio engineering.
                You don&apos;t need a catalog subscription. Cue Track lets you enter your
                BPM, time signature, and section structure, pick a voice for the spoken
                cues, and download a ready-to-use click/cue track in under two minutes.
              </p>
            </section>

            {/* CTA */}
            <div className="border-t border-surface-border pt-8 mt-12">
              <div className="bg-surface-raised border border-surface-border rounded-lg p-8 text-center">
                <h3 className="font-display text-2xl mb-3">
                  Ready to build your first click track?
                </h3>
                <p className="font-body text-neutral-400 mb-6">
                  Enter your song&apos;s BPM, structure, and time signature.
                  Get a downloadable click/cue track in two minutes.
                </p>
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 bg-accent-500 text-black font-mono text-sm font-semibold px-8 py-4 rounded hover:bg-accent-400 transition-colors"
                >
                  Create a Track
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
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
