import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'The Complete IEM Cue Track Guide for Live Musicians | Cue Track',
  description:
    'Everything you need to know about cue tracks for in-ear monitors: what they are, why IEM users need them, types of cues, structuring for live performance, and equipment basics.',
  openGraph: {
    title: 'The Complete IEM Cue Track Guide for Live Musicians',
    description:
      'Everything you need to know about cue tracks for in-ear monitors: what they are, why IEM users need them, types of cues, structuring for live performance, and equipment basics.',
    type: 'article',
  },
};

export default function IemCueTrackGuidePage() {
  return (
    <div className="min-h-screen bg-surface text-white">
      <Nav />
      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-4">
              Live Sound
            </p>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6">
              The Complete IEM Cue Track Guide for Live Musicians
            </h1>
            <p className="font-body text-lg text-neutral-400 leading-relaxed">
              When you are wearing in-ear monitors, you cannot hear the drummer count off.
              You cannot see the worship leader&apos;s hand signal for the bridge. A cue track
              solves this by putting a voice in your ears that tells you exactly what is coming
              next — and when.
            </p>
          </header>

          <div className="prose-dark space-y-12">

            <section>
              <h2 className="font-display text-2xl mb-4">What is a cue track — and how is it different from a click track?</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                A <strong className="text-white">click track</strong> is a metronome: a steady
                pulse at your song&apos;s BPM that keeps the band in time. It tells you when
                to play. It does not tell you what to play or what section comes next.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                A <strong className="text-white">cue track</strong> is a click track with spoken
                announcements layered on top. Those announcements — section names, count-ins,
                bar countdowns — give musicians the structural information they need to navigate
                a song without eye contact, without counting bars in their heads, and without
                depending on a bandleader&apos;s visual cues.
              </p>
              <div className="bg-surface-raised border border-surface-border rounded-lg p-6 my-6">
                <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-3">
                  What you actually hear in your IEMs
                </p>
                <div className="space-y-4 font-mono text-sm text-neutral-300">
                  <div>
                    <div className="text-neutral-500 mb-1">Click only — tempo without context:</div>
                    <div>tick tick tick tick | tick tick tick tick | tick tick tick tick...</div>
                  </div>
                  <div>
                    <div className="text-neutral-500 mb-1">Click + cues — tempo with direction:</div>
                    <div>tick tick tick tick | tick tick <span className="text-accent-500">&quot;Verse&quot;</span> tick | <span className="text-accent-500">&quot;1, 2, 3, 4&quot;</span> | TICK tick tick tick...</div>
                  </div>
                </div>
              </div>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                The difference is the difference between navigating with and without a map.
                A click track tells you the speed of travel. A cue track tells you where you
                are and what intersection is coming up.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed">
                In practice: with just a click, musicians count bars mentally and hope they
                land on the section transition together. With cues, everyone hears &quot;Chorus&quot;
                one bar before the chorus starts and has time to physically prepare — adjust
                their playing position, change an effects patch, hit a dynamic entrance cleanly.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Why IEM users need cue tracks specifically</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                In-ear monitors are now standard in worship bands, touring acts, corporate
                events, and theater productions. The benefits are well-known: personal mix
                control, hearing protection, feedback elimination, and consistent monitoring
                regardless of room acoustics.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                But IEMs create a specific problem that wedge monitors did not: acoustic
                isolation. Each musician is in their own audio world. The natural communication
                cues that live performance used to rely on are gone.
              </p>

              <div className="space-y-4 mb-6">
                <div className="flex gap-4">
                  <div className="text-accent-500 font-mono text-sm mt-1 shrink-0">01</div>
                  <div>
                    <h3 className="font-display text-lg mb-1 text-white">You cannot hear the drummer count off</h3>
                    <p className="font-body text-sm text-neutral-300 leading-relaxed">
                      The traditional count-off — the drummer clicking sticks together four
                      times before the song starts — is usually audible on stage through air
                      transmission and floor vibration. With IEMs sealed in your ears, that
                      physical channel is blocked. Unless the count-off is routed into the
                      monitor mix, you may not know the song has started until the downbeat.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="text-accent-500 font-mono text-sm mt-1 shrink-0">02</div>
                  <div>
                    <h3 className="font-display text-lg mb-1 text-white">Visual signals are unreliable</h3>
                    <p className="font-body text-sm text-neutral-300 leading-relaxed">
                      A worship leader raising a hand for &quot;bridge again&quot; works when
                      everyone is watching. In practice, the keyboard player is looking at
                      their chart. The bassist is watching their fingers on a difficult run.
                      The guitarist is turned toward the drummer for tempo reference. Nobody
                      sees the signal. The bridge either goes as planned or becomes a
                      confusing negotiation in real time.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="text-accent-500 font-mono text-sm mt-1 shrink-0">03</div>
                  <div>
                    <h3 className="font-display text-lg mb-1 text-white">Counting bars silently is high cognitive load</h3>
                    <p className="font-body text-sm text-neutral-300 leading-relaxed">
                      An 8-bar verse at 120 BPM takes 16 seconds. Keeping a mental count
                      during that time — while playing, singing, managing effects, and
                      staying present on stage — consumes attention you need for other things.
                      A song with 8 sections has 8 moments where one musician&apos;s count
                      can diverge from another&apos;s. Cue tracks externalize that counting
                      so no one has to do it internally.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="text-accent-500 font-mono text-sm mt-1 shrink-0">04</div>
                  <div>
                    <h3 className="font-display text-lg mb-1 text-white">Substitutes and first-timers need audio navigation</h3>
                    <p className="font-body text-sm text-neutral-300 leading-relaxed">
                      A regular band member who has rehearsed a song 20 times can follow
                      a bare click. A substitute drummer playing with your team for the
                      first time cannot. Cue tracks make it possible for any musician with
                      basic song knowledge to navigate a set they have never played with
                      your specific band before.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Types of cues and when to use each</h2>

              <div className="space-y-6">
                <div>
                  <div className="border-l-2 border-accent-500 pl-6 mb-4">
                    <h3 className="font-display text-xl mb-2 text-white">Section announcements</h3>
                    <p className="font-body text-sm text-neutral-500 font-mono">
                      Example: &quot;Verse&quot; — &quot;Chorus&quot; — &quot;Bridge&quot; — &quot;Outro&quot;
                    </p>
                  </div>
                  <p className="font-body text-neutral-300 leading-relaxed mb-4">
                    The most fundamental cue type. A spoken voice names the upcoming section
                    one bar (or sometimes two bars) before it begins. Every musician hears
                    the same announcement at the same time, regardless of where their
                    attention is focused.
                  </p>
                  <p className="font-body text-neutral-300 leading-relaxed mb-4">
                    Section announcements are the right place to start for any band introducing
                    cue tracks. They solve the most common IEM coordination failure — misaligned
                    section transitions — with the minimum complexity.
                  </p>
                  <p className="font-body text-neutral-300 leading-relaxed">
                    The timing of announcement placement matters: the voice should fire at the
                    last beat of bar N-1, where N is the first bar of the new section. Firing
                    at the downbeat of the new section is too late — the band is already there.
                    Firing two bars early leaves more time but requires musicians to hold the
                    information longer, which can create false anticipations.
                  </p>
                </div>

                <div>
                  <div className="border-l-2 border-accent-500/60 pl-6 mb-4">
                    <h3 className="font-display text-xl mb-2 text-white">Count-ins</h3>
                    <p className="font-body text-sm text-neutral-500 font-mono">
                      Example: &quot;1, 2, 3, 4&quot; — &quot;1, 2, 3&quot; (for 3/4) — &quot;and 2 and 3 and 4 and&quot;
                    </p>
                  </div>
                  <p className="font-body text-neutral-300 leading-relaxed mb-4">
                    A spoken beat count over the last bar before a section. The numbers fall
                    on actual beat positions in the click grid, so they function as both
                    information (&quot;here is what section is coming&quot;) and timing reference
                    (&quot;here is exactly where the downbeat falls&quot;).
                  </p>
                  <p className="font-body text-neutral-300 leading-relaxed mb-4">
                    Count-ins are most useful for:
                  </p>
                  <ul className="font-body text-neutral-300 leading-relaxed space-y-2 list-disc list-outside ml-6 mb-4">
                    <li>The very start of a song, before the first downbeat</li>
                    <li>Sections that require a strong rhythmic entrance (a hard hit on beat 1)</li>
                    <li>Sections where the energy level changes dramatically and musicians need a physical preparation cue</li>
                    <li>Songs in unusual time signatures where the pulse can be ambiguous</li>
                  </ul>
                  <p className="font-body text-neutral-300 leading-relaxed">
                    For a subdivided feel, a spoken &quot;and 2 and 3 and 4 and&quot; over the last bar
                    gives musicians the eighth-note grid and helps them lock in to the exact
                    moment they need to land on.
                  </p>
                </div>

                <div>
                  <div className="border-l-2 border-accent-500/40 pl-6 mb-4">
                    <h3 className="font-display text-xl mb-2 text-white">Bar countdowns</h3>
                    <p className="font-body text-sm text-neutral-500 font-mono">
                      Example: &quot;4 bars&quot; — &quot;3 bars&quot; — &quot;2 bars&quot; — &quot;1 bar&quot; — [section begins]
                    </p>
                  </div>
                  <p className="font-body text-neutral-300 leading-relaxed mb-4">
                    Voiced bar counts that fire in the final four bars before a section
                    transition. Each announcement fires on the downbeat of the corresponding
                    bar: &quot;4 bars&quot; on the downbeat of bar N-4, &quot;3 bars&quot; on N-3, and so on.
                  </p>
                  <p className="font-body text-neutral-300 leading-relaxed mb-4">
                    Bar countdowns are most useful for long sections (8+ bars) where the section
                    is far enough away that a single announcement one bar out is the only
                    warning — and for complex transitions like key changes, time signature
                    changes, or dynamic drops where musicians need more preparation time.
                  </p>
                  <p className="font-body text-neutral-300 leading-relaxed">
                    They are less useful for short sections (4 bars or fewer), where the
                    countdown would be firing for half the section and creating noise instead
                    of signal.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">How to structure cues for maximum usefulness</h2>

              <h3 className="font-display text-xl mb-3 text-neutral-200">Principle 1: Start with less than you think you need</h3>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                A cue track with too many announcements becomes noise. If every section
                has a section announcement, a bar countdown starting four bars out, and a
                full count-in, musicians start filtering out the voice because there is
                always something being said. The cues stop registering as signals.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-6">
                Start with section announcements only. Add count-ins for sections that
                require strong rhythmic entrances. Add bar countdowns only for transitions
                that are consistently missed in rehearsal. Every cue you add should solve
                a specific problem you have observed.
              </p>

              <h3 className="font-display text-xl mb-3 text-neutral-200">Principle 2: Use the same terminology the band uses</h3>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                If your band calls the repeated section at the end of the song a &quot;Tag,&quot;
                the cue voice should say &quot;Tag.&quot; If they call it &quot;Outro,&quot; use
                &quot;Outro.&quot; Do not introduce new terminology in the cue track that
                musicians have to mentally translate. The recognition needs to be instant:
                hear the word, know exactly where you are.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-6">
                Universal section names that work across most contexts: Intro, Verse,
                Pre-Chorus, Chorus, Bridge, Instrumental, Outro, Tag. For numbered
                sections: Verse 1, Verse 2 (or just Verse — most musicians know when
                it&apos;s the second one from context).
              </p>

              <h3 className="font-display text-xl mb-3 text-neutral-200">Principle 3: One bar of warning is usually right</h3>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                At 120 BPM, one bar is 2 seconds. At 90 BPM, one bar is about 2.7 seconds.
                That is enough time for a musician to:
              </p>
              <ul className="font-body text-neutral-300 leading-relaxed space-y-2 list-disc list-outside ml-6 mb-4">
                <li>Shift their hand position for a chord change</li>
                <li>Step on a sustain pedal or effects switch</li>
                <li>Change a synth or guitar patch via MIDI</li>
                <li>Adjust their dynamics for a quiet or loud entrance</li>
                <li>Take a breath before coming in vocally</li>
              </ul>
              <p className="font-body text-neutral-300 leading-relaxed mb-6">
                Two bars works if the transition requires complex preparation (a key modulation,
                a time signature change, a dramatic dynamic shift from fortissimo to nearly
                silent). Avoid announcing more than two bars early — the warning period becomes
                so long that it bleeds into the middle of the previous section.
              </p>

              <h3 className="font-display text-xl mb-3 text-neutral-200">Principle 4: Mix the cue voice to sit under the click, not over it</h3>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                The click pulse is the primary timing reference. It should never be
                obscured by the cue voice. A practical starting point is to set the
                cue voice at -6 to -8 dB relative to the click level. Musicians should
                be able to hear the voice clearly but still feel the click as the
                dominant element.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                In the frequency domain, a cue voice that has not been high-passed can
                create a low-mid buildup that muddies IEM playback. The spoken voice
                does not need frequencies below 200–300 Hz for intelligibility; cutting
                below that improves clarity without reducing perceived volume.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed">
                Some teams use a voice that is distinctly different in character from
                the click tone — a warm, measured voice against a sharp, dry click. The
                timbral contrast helps the brain route the two signals to separate
                attention channels.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Example: cue structure for a full worship song</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                Here is how cues might be structured for a 4/4 song at 100 BPM with a
                straightforward contemporary worship arrangement:
              </p>
              <div className="bg-surface-raised border border-surface-border rounded-lg p-6">
                <p className="font-mono text-xs text-accent-500 uppercase tracking-wider mb-4">
                  Song map with cue positions
                </p>
                <div className="space-y-1 font-mono text-sm text-neutral-300">
                  <div className="text-neutral-500 mb-2">— Bar — Section — Cue fires</div>
                  <div>Bar 1–4 ....... Intro .......... <span className="text-accent-500">&quot;1, 2, 3, 4&quot; on bar 1</span></div>
                  <div>Bar 4 beat 4 .. ............... <span className="text-accent-500">&quot;Verse&quot; on bar 4 beat 4</span></div>
                  <div>Bar 5–12 ...... Verse 1 .......</div>
                  <div>Bar 12 beat 4 . ............... <span className="text-accent-500">&quot;Chorus&quot; on bar 12 beat 4</span></div>
                  <div>Bar 13–20 ..... Chorus ........</div>
                  <div>Bar 20 beat 4 . ............... <span className="text-accent-500">&quot;Verse&quot; on bar 20 beat 4</span></div>
                  <div>Bar 21–28 ..... Verse 2 .......</div>
                  <div>Bar 28 beat 4 . ............... <span className="text-accent-500">&quot;Chorus&quot; on bar 28 beat 4</span></div>
                  <div>Bar 29–36 ..... Chorus ........</div>
                  <div>Bar 35 beat 1 . ............... <span className="text-accent-500">&quot;4 bars&quot; (bridge countdown)</span></div>
                  <div>Bar 36 beat 1 . ............... <span className="text-accent-500">&quot;3 bars&quot;</span></div>
                  <div>Bar 36 beat 3 . ............... <span className="text-accent-500">&quot;Bridge&quot;</span></div>
                  <div>Bar 37–44 ..... Bridge ........</div>
                  <div>Bar 44 beat 4 . ............... <span className="text-accent-500">&quot;Chorus&quot; on bar 44 beat 4</span></div>
                  <div>Bar 45–52 ..... Final Chorus ..</div>
                  <div>Bar 52 beat 4 . ............... <span className="text-accent-500">&quot;Outro&quot; on bar 52 beat 4</span></div>
                  <div>Bar 53–56 ..... Outro .........</div>
                </div>
              </div>
              <p className="font-body text-neutral-300 leading-relaxed mt-4">
                Notice that the bridge gets a 3-bar countdown in addition to the &quot;Bridge&quot;
                announcement — it is structurally the most complex transition in this song,
                so it gets more warning. Everything else gets a single one-bar announcement.
                The intro gets a count-in because it is the start of the song and the band
                needs a rhythmic entry point.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Equipment considerations for cue track delivery</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                A cue track is just an audio file. It plays back through whatever playback
                system you already have. The equipment considerations are about routing and
                individual control, not about the cue track format itself.
              </p>

              <h3 className="font-display text-xl mb-3 text-neutral-200">Entry-level setup (single shared level)</h3>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                Phone or tablet playing the audio file via a music app → 3.5mm TRS to the
                mixer → a single aux send to all IEM packs. Everyone hears the same click
                level. Simple to set up, but does not allow individual musicians to mix
                their own click volume.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                This works for small teams where everyone agrees on a single click level.
                It is also sufficient for any band just starting to run cue tracks —
                simplicity helps adoption.
              </p>

              <h3 className="font-display text-xl mb-3 text-neutral-200">Personal mix setup (individual control)</h3>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                Playback laptop → audio interface (two or more outputs) → console input
                channel for the click → one aux send per IEM user → individual IEM packs
                with personal mix capability. Each musician has control of their own click
                level in their ears.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                Common console choices for this setup: Behringer X32 or M32, Allen and
                Heath SQ series, Yamaha QL/CL. Each has personal monitor apps (Behringer
                Monitors, ME Connect, MonitorMix) that let musicians adjust their IEM mix
                from their phones without touching the main console.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                Some teams split the click track into a stereo file with the click pulse
                panned left and the cue voice panned right. Musicians can then use the
                stereo width in their personal mix to favor more click or more cue
                depending on their preference.
              </p>

              <h3 className="font-display text-xl mb-3 text-neutral-200">Multitrack setup (click embedded in a full stem session)</h3>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                For teams running full multitrack playback — pads, loops, percussion stems,
                orchestral elements — the cue track is one track in a session alongside
                the musical content. The session runs in Ableton Live, MainStage, Loop
                Community Prime, or MultiTracks Playback. The cue track audio file imports
                directly as a standard audio clip.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed">
                In this setup, the click/cue audio file is the same file regardless of
                whether it is used standalone or embedded in a multitrack session. The
                format is a standard stereo WAV or MP3. No special integration is required.
              </p>

              <h3 className="font-display text-xl mb-3 text-neutral-200">IEM hardware options at different price points</h3>
              <div className="space-y-3 mt-4">
                <div className="bg-surface-raised border border-surface-border rounded-lg p-5">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="font-mono text-xs text-accent-500 uppercase tracking-wider">Budget</span>
                    <span className="font-display text-sm text-neutral-200">Under $200 total</span>
                  </div>
                  <p className="font-body text-sm text-neutral-300 leading-relaxed">
                    Behringer P2 personal monitor amplifier ($70) with a Mackie MP-120 IEM
                    earphone ($40). Wired connection. Adequate isolation, decent audio quality.
                    Works for a drummer who just needs click delivered reliably.
                  </p>
                </div>
                <div className="bg-surface-raised border border-surface-border rounded-lg p-5">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="font-mono text-xs text-accent-500 uppercase tracking-wider">Mid-range</span>
                    <span className="font-display text-sm text-neutral-200">$400–$800 per user</span>
                  </div>
                  <p className="font-body text-sm text-neutral-300 leading-relaxed">
                    Sennheiser EW 300 IEM G4 or Shure PSM 300 wireless transmitter/receiver.
                    Full wireless freedom. Reliable RF performance on crowded stages.
                    Pair with Shure SE215 or Sennheiser IE 40 Pro earphones.
                  </p>
                </div>
                <div className="bg-surface-raised border border-surface-border rounded-lg p-5">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="font-mono text-xs text-accent-500 uppercase tracking-wider">Professional</span>
                    <span className="font-display text-sm text-neutral-200">$1,000+ per user</span>
                  </div>
                  <p className="font-body text-sm text-neutral-300 leading-relaxed">
                    Shure PSM 900 or 1000, Sennheiser EW-D series. Custom-molded multi-driver
                    IEM earphones (Ultimate Ears, 1964 Ears, JH Audio). The earphone quality
                    makes a larger practical difference than the transmitter at this level.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Getting your band comfortable with cue tracks</h2>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                The biggest adoption barrier for cue tracks is not technical — it is that
                musicians find a voice in their ears distracting until they get used to it.
                The solution is gradual introduction, not a full-band mandate.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                Start with the drummer. The drummer has the most to gain from cue tracks
                (transition accuracy, count-off replacement) and is usually the most
                willing to try them. Once the drummer is comfortable, the click/cue track
                is already running for every song. Add other musicians to the click send
                one at a time, on songs they already know well.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed mb-4">
                At rehearsal, run the cue track alongside a human count-off or visual cue
                for the first few runs of a new song. Let musicians compare what they hear
                in the track to what they expect. Once they trust that the cue voice is
                accurate and well-timed, they will start relying on it.
              </p>
              <p className="font-body text-neutral-300 leading-relaxed">
                The conversion moment is usually the first time a cue track saves a section
                transition that would have fallen apart otherwise — a bassist who misses the
                bridge and recovers because they heard &quot;Bridge in two.&quot; After that
                experience, most musicians do not want to play without cues.
              </p>
            </section>

            {/* CTA */}
            <div className="border-t border-surface-border pt-8 mt-12">
              <div className="bg-surface-raised border border-surface-border rounded-lg p-8 text-center">
                <h3 className="font-display text-2xl mb-3">
                  Generate your first cue track
                </h3>
                <p className="font-body text-neutral-400 mb-6">
                  Enter your song&apos;s BPM and structure. Pick a cue voice.
                  Download a click and cue track ready for your IEM rig — in under two minutes.
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
