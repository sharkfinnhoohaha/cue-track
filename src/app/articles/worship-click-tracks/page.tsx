import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'How to Create Click Tracks for Worship Bands | Cue Track',
  description:
    'A practical guide for worship leaders who need click tracks for originals, obscure songs, and custom arrangements — no DAW required.',
  openGraph: {
    title: 'How to Create Click Tracks for Worship Bands',
    description:
      'A practical guide for worship leaders who need click tracks for originals, obscure songs, and custom arrangements — no DAW required.',
    type: 'article',
  },
};

export default function WorshipClickTracksPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav />
      <article className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="font-mono text-xs text-accent uppercase tracking-wider mb-4">
              Worship
            </p>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6">
              How to Create Click Tracks for Worship Bands
            </h1>
            <p className="font-body text-lg text-zinc-400 leading-relaxed">
              Worship teams have specific click track requirements that general metronome apps
              and DAW tutorials rarely address. This guide covers everything from why you need
              a click in the first place, to what your options actually are, to how to build
              a complete click and cue track for a Sunday set — with or without a DAW.
            </p>
          </header>

          <div className="prose-dark space-y-12">

            <section>
              <h2 className="font-display text-2xl mb-4">Why worship bands need click tracks</h2>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                A worship band that runs backing tracks, loops, or stems has no choice: the
                live musicians must lock to the pre-recorded material. If the drummer rushes
                the bridge by four BPM, the whole band rushes with them — and the backing
                track stays exactly where it was. The result is an audible train wreck.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                Even bands that do not run tracks benefit from click for different reasons.
                Modern worship songs are tightly arranged. There are real transitions —
                a moment where the band drops to half-time, a key change going into the final
                chorus, a rubato outro that re-enters at tempo. Without a shared tempo
                reference, those transitions are negotiated in real time by whoever is most
                confident that week. Sometimes it works. Often it does not.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                The third reason is IEM coordination. When your entire band is wearing
                in-ears and running their own monitor mixes, the natural audio cues that
                used to help everyone navigate — the drummer&apos;s crash on the downbeat,
                the keys landing on the chord change, the subtle lean-in the worship leader
                does before a chorus — are gone or muffled. Spoken voice cues in the click
                track replace those physical cues: &quot;Chorus,&quot; &quot;Bridge in two,&quot;
                &quot;Tag.&quot; Everyone hears the same instruction at the same moment.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed">
                This is the difference between a click track and a cue track. A click track
                is a metronome with section awareness. A cue track adds spoken announcements
                so the band can navigate without eye contact.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">The current landscape: three paths and their tradeoffs</h2>

              <h3 className="font-display text-xl mb-3 text-zinc-100">Option 1: DAW-based (Ableton, Logic, MainStage)</h3>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                This is how large worship teams at mid-sized and large churches have solved
                the problem for years. A designated audio engineer or production director
                builds click tracks in Ableton Live or MainStage, routing the click to a
                dedicated output sent only to IEMs. Full control over tempo maps,
                time signature changes, and custom cue audio.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                The cost is significant: Ableton Live Standard runs $449. A four-output
                audio interface to properly isolate the click channel adds $200–$500 more.
                And Ableton&apos;s built-in click is widely criticized as unusable —
                worship leaders have documented having to build custom MIDI Impulse
                workarounds just to get a properly subdivided click tone. The learning
                curve for non-engineers is steep, and the setup requires consistent
                maintenance.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                For a church with a full production team, this works well. For a church
                where the worship leader is also the sound operator is also the
                volunteer coordinator, it is a significant operational commitment.
              </p>

              <h3 className="font-display text-xl mb-3 text-zinc-100">Option 2: Catalog-based apps (MultiTracks Playback, Loop Community Prime)</h3>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                MultiTracks Playback and Loop Community Prime have libraries of pre-built
                click and cue tracks for the most common worship songs from Hillsong,
                Elevation, Bethel, Jesus Culture, and similar catalogs. If your Sunday
                set consists entirely of major-label worship songs, these apps work well.
                Voice section cues are pre-recorded and perfectly timed.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                The limitation is the catalog. If you play original songs, or songs from
                smaller local artists, or older hymns with custom arrangements, or licensed
                songs that are not in the MultiTracks database, you are on your own. The
                catalog apps will not generate a click track for a song they do not carry.
                And the voice cues in MultiTracks are locked behind the Live Bundle tier
                at $29.99/month — the cheaper tiers include a click but no spoken guidance.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                Both apps are iOS and Mac only. No Android, no Windows, no web access.
              </p>

              <h3 className="font-display text-xl mb-3 text-zinc-100">Option 3: Web-based generation (the emerging path)</h3>
              <p className="font-body text-zinc-300 leading-relaxed">
                This is the approach that works for any song, on any device, without app
                installation or DAW knowledge. You enter the song&apos;s structure — BPM,
                time signature, sections and bar counts — and the generator produces a
                downloadable audio file with embedded voice cues. The file plays in any
                audio app, on any playback device the band already owns.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">
                Step-by-step: building a click track for a worship set
              </h2>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                Regardless of which tool you use, the process for building a worship click
                track follows the same steps. Here is how to do it correctly.
              </p>

              <div className="space-y-8">
                <div>
                  <h3 className="font-mono text-sm text-accent uppercase tracking-wider mb-3">Step 1 — Determine the BPM</h3>
                  <p className="font-body text-zinc-300 leading-relaxed mb-4">
                    Find or verify the BPM of each song in your set. For catalog songs, check
                    a BPM database like SongBPM.com. For originals or custom arrangements,
                    use a tap tempo: tap along with the song or play it at your intended tempo
                    and measure it.
                  </p>
                  <p className="font-body text-zinc-300 leading-relaxed mb-4">
                    Some worship songs have intentional tempo variations. A common arrangement
                    choice is a rubato or free-tempo intro that locks into click at bar 3 or 5.
                    If your song does this, your click track should either start at the downbeat
                    of the locked section, or include a count-in before that point to cue the band.
                  </p>
                  <div className="bg-zinc-950-raised border border-surface-border rounded-lg p-6">
                    <p className="font-mono text-xs text-accent uppercase tracking-wider mb-3">
                      Common worship song BPM ranges
                    </p>
                    <div className="space-y-2 font-body text-sm text-zinc-300">
                      <div><span className="font-mono text-zinc-100">60–75</span> — Slow ballads, reflective songs, prayers</div>
                      <div><span className="font-mono text-zinc-100">76–92</span> — Mid-tempo worship, groove-based songs</div>
                      <div><span className="font-mono text-zinc-100">93–110</span> — Contemporary pop worship (most Elevation, Hillsong UNITED)</div>
                      <div><span className="font-mono text-zinc-100">111–130</span> — Upbeat, high-energy anthems</div>
                      <div><span className="font-mono text-zinc-100">130+</span> — Fast praise, double-time feel songs</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-mono text-sm text-accent uppercase tracking-wider mb-3">Step 2 — Determine the time signature</h3>
                  <p className="font-body text-zinc-300 leading-relaxed mb-4">
                    Most worship songs are in 4/4. Some are in 6/8 (a characteristic triplet
                    feel — &quot;What a Beautiful Name,&quot; &quot;Oceans&quot;). A few are in 3/4.
                    Mixed-meter songs with time signature changes between sections are rare in
                    contemporary worship but do appear in creative arrangements.
                  </p>
                  <p className="font-body text-zinc-300 leading-relaxed">
                    If you are unsure, count along with the recorded version: count 1-2-3-4 and
                    see if the downbeat of each bar lands on your &quot;1.&quot; If your &quot;1&quot;
                    keeps landing on &quot;2&quot; or &quot;3,&quot; you may be in 3/4 or 6/8.
                  </p>
                </div>

                <div>
                  <h3 className="font-mono text-sm text-accent uppercase tracking-wider mb-3">Step 3 — Map the section structure in bars</h3>
                  <p className="font-body text-zinc-300 leading-relaxed mb-4">
                    This is the step most people skip, and it is the most important one. You
                    need to know how many bars each section of the song runs. Count through
                    the recorded version bar by bar. Write it down.
                  </p>
                  <div className="bg-zinc-950-raised border border-surface-border rounded-lg p-6 mb-4">
                    <p className="font-mono text-xs text-accent uppercase tracking-wider mb-3">
                      Example: 4/4, 96 BPM — original song structure map
                    </p>
                    <div className="space-y-1 font-mono text-sm text-zinc-300">
                      <div>Intro ................. <span className="text-zinc-100">4 bars</span></div>
                      <div>Verse 1 .............. <span className="text-zinc-100">8 bars</span></div>
                      <div>Pre-chorus ........... <span className="text-zinc-100">4 bars</span></div>
                      <div>Chorus ............... <span className="text-zinc-100">8 bars</span></div>
                      <div>Verse 2 .............. <span className="text-zinc-100">8 bars</span></div>
                      <div>Pre-chorus ........... <span className="text-zinc-100">4 bars</span></div>
                      <div>Chorus ............... <span className="text-zinc-100">8 bars</span></div>
                      <div>Bridge ............... <span className="text-zinc-100">8 bars</span></div>
                      <div>Chorus (final) ....... <span className="text-zinc-100">8 bars</span></div>
                      <div>Outro ................ <span className="text-zinc-100">4 bars</span></div>
                    </div>
                    <p className="font-mono text-xs text-zinc-500 mt-3">
                      Total: 64 bars × 4 beats ÷ 96 BPM × 60 = 160 seconds ≈ 2:40
                    </p>
                  </div>
                  <p className="font-body text-zinc-300 leading-relaxed">
                    For worship team use, the cue voice announcement for each section should
                    fire at the last bar or two of the previous section — not at the start
                    of the new one. If the chorus has 8 bars and the voice says &quot;Chorus&quot;
                    on bar 1 of the chorus, the band is already late. If it says &quot;Chorus
                    in two&quot; at bar 7 of the preceding verse, the band has two bars to
                    physically prepare.
                  </p>
                </div>

                <div>
                  <h3 className="font-mono text-sm text-accent uppercase tracking-wider mb-3">Step 4 — Choose your cue voice and style</h3>
                  <p className="font-body text-zinc-300 leading-relaxed mb-4">
                    Voice cues should be clear, calm, and positioned in the mix so they cut
                    through without startling. Common approaches:
                  </p>
                  <ul className="font-body text-zinc-300 leading-relaxed space-y-3 list-disc list-outside ml-6">
                    <li>
                      <strong className="text-zinc-100">Section name only:</strong> &quot;Verse,&quot;
                      &quot;Chorus,&quot; &quot;Bridge,&quot; &quot;Outro.&quot; Simple and direct.
                      Works for a band that runs the same arrangement every week and has the
                      structure memorized.
                    </li>
                    <li>
                      <strong className="text-zinc-100">Section with bar countdown:</strong>
                      &quot;Chorus in four,&quot; &quot;Bridge in two.&quot; More useful for a band
                      learning a new song, or for transitions that need precise preparation
                      such as key changes or time signature changes.
                    </li>
                    <li>
                      <strong className="text-zinc-100">Beat count-ins:</strong>
                      &quot;One, two, three, four&quot; at the top of the first bar, or a subdivided
                      count-in before a section that comes in on the and-of-four.
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-mono text-sm text-accent uppercase tracking-wider mb-3">Step 5 — Generate, listen, and test</h3>
                  <p className="font-body text-zinc-300 leading-relaxed mb-4">
                    Once the track is generated, listen to the full file before using it at
                    rehearsal. Verify:
                  </p>
                  <ul className="font-body text-zinc-300 leading-relaxed space-y-2 list-disc list-outside ml-6">
                    <li>The BPM feels correct at your intended performance tempo</li>
                    <li>Section cue voices fire at the right moment — before the section, not on the downbeat of it</li>
                    <li>The total duration matches your expected song length</li>
                    <li>No sections are missing or out of order</li>
                    <li>The time signature accent pattern feels natural (beat 1 accented in 4/4)</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Voice cues: why they matter for band coordination</h2>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                In a traditional monitor setup with wedges, the worship leader communicates
                transitions visually — a nod, a raised hand, a count-in gesture. The drummer
                watches the leader. The bassist watches the drummer. Information travels
                through the band via a chain of physical signals.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                In an IEM environment, this chain is disrupted. Each band member is in their
                own audio world, mixing themselves with partial or no awareness of what others
                are hearing. Eye contact still works, but it requires everyone to be watching
                each other at the right moment — which conflicts with watching music stands,
                chord charts, and congregation members.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                Voice cues in the click track bypass this problem entirely. The instruction
                goes directly to every band member&apos;s ears simultaneously, with no
                dependency on anyone watching anyone else. A bass player can be eyes-down
                on a difficult chord change and still hear &quot;Chorus in two&quot; with
                enough time to prepare.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                The practical effect on rehearsal time is significant. A band learning a new
                song with a voice-cued click track typically learns the arrangement structure
                faster than a band rehearsing to a bare metronome, because the cues reinforce
                the section map on every run-through.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed">
                For guest musicians, substitute players, and touring support acts performing
                with a worship team for the first time, voice cues are especially valuable.
                A substitute drummer who has never played with your team can follow a cue track
                through a song they have never rehearsed and hit every transition correctly —
                because the track tells them what is coming.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">IEM setup basics for click and cue delivery</h2>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                The click and cue track needs to reach the band through their IEMs without
                bleeding into the main PA or monitor wedges. This requires routing the
                click to a dedicated monitor mix — a mix that only the band hears, not the
                congregation.
              </p>

              <h3 className="font-display text-xl mb-3 text-zinc-100">Basic hardware requirements</h3>
              <ol className="font-body text-zinc-300 leading-relaxed mb-6 space-y-3 list-decimal list-outside ml-6">
                <li>
                  A playback device — laptop, iPad, or audio interface connected to a computer —
                  with at least two outputs: one for main audio content and one for the click/cue mix.
                </li>
                <li>
                  An audio interface with multiple outputs if you are running a laptop setup.
                  The click output routes to your mixer as a dedicated channel, bussed into the
                  IEM mix only.
                </li>
                <li>
                  An IEM transmitter and receiver. Budget wired systems start around $150
                  (Behringer P2 personal monitor amp). Wireless IEM systems start around $400
                  and scale significantly depending on the number of users.
                </li>
                <li>
                  IEM earphones. These range from $20 single-driver in-ears to $800+
                  custom-molded monitors. For click track use, any in-ear that provides
                  reasonable isolation will work.
                </li>
              </ol>

              <h3 className="font-display text-xl mb-3 text-zinc-100">Routing the click on a digital console</h3>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                On a digital console (Allen and Heath, Behringer X32/M32, Yamaha CL/QL,
                or similar), route the click track as a standard input channel. Send it
                at full level to every IEM aux mix. Pan it center. Do not send it to the
                main LR or any stage wedge mix. Label the channel &quot;CLICK&quot; clearly
                so volunteers do not accidentally unmute it into the mains.
              </p>
              <p className="font-body text-zinc-300 leading-relaxed mb-4">
                Some teams run the click track in stereo with the spoken cues panned slightly
                left and the metronomic click slightly right. This helps the brain distinguish
                the two elements. Others run it mono. Either works; choose based on your IEM
                transmitter configuration.
              </p>

              <h3 className="font-display text-xl mb-3 text-zinc-100">Who gets the click in their mix</h3>
              <p className="font-body text-zinc-300 leading-relaxed">
                For a tight rhythm section, every musician benefits from having the click
                available in their mix. In practice, many bands give the full click only to
                the drummer and let others decide how much they want to hear. Vocalists
                sometimes prefer a lighter click level — just enough to feel the pulse without
                it distracting from their performance. The key is that the click is available
                to anyone who wants it at full level. Route it to all monitor mixes and let
                each musician set their own preference.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl mb-4">Common mistakes and how to avoid them</h2>
              <div className="space-y-4">
                <div className="bg-zinc-950-raised border border-surface-border rounded-lg p-6">
                  <h3 className="font-display text-lg mb-2 text-zinc-100">
                    Building the click at the wrong BPM
                  </h3>
                  <p className="font-body text-sm text-zinc-300 leading-relaxed">
                    If your click is 3–5 BPM off from your intended tempo, rehearsal will feel
                    slightly wrong but no one will be able to identify why. Always verify BPM
                    against the original recording or a tap tempo measurement before building.
                  </p>
                </div>
                <div className="bg-zinc-950-raised border border-surface-border rounded-lg p-6">
                  <h3 className="font-display text-lg mb-2 text-zinc-100">
                    Cues that fire at the start of the section instead of before it
                  </h3>
                  <p className="font-body text-sm text-zinc-300 leading-relaxed">
                    A cue that says &quot;Chorus&quot; on beat 1 of the chorus tells the band what
                    is already happening. It provides no preparation time. Cues should fire one
                    or two bars before the section change so musicians can adjust, prepare a key
                    change, or get ready to hit a dynamic entrance.
                  </p>
                </div>
                <div className="bg-zinc-950-raised border border-surface-border rounded-lg p-6">
                  <h3 className="font-display text-lg mb-2 text-zinc-100">
                    Running click to wedges instead of IEMs
                  </h3>
                  <p className="font-body text-sm text-zinc-300 leading-relaxed">
                    A click track on a stage monitor wedge is audible to the congregation.
                    Verify that your click channel is not sent to any wedge or main PA output.
                    If you do not have IEMs, a simple personal monitor amp wired to a single
                    earpiece is sufficient for the drummer.
                  </p>
                </div>
                <div className="bg-zinc-950-raised border border-surface-border rounded-lg p-6">
                  <h3 className="font-display text-lg mb-2 text-zinc-100">
                    Not testing the full track before Sunday
                  </h3>
                  <p className="font-body text-sm text-zinc-300 leading-relaxed">
                    Always listen to the entire generated track from start to finish before
                    rehearsal. Verify section counts, cue timing, and that the file ends
                    correctly. A 30-second review prevents discovering mid-song that the
                    outro is missing or the bridge fires one bar too early.
                  </p>
                </div>
              </div>
            </section>

            {/* CTA */}
            <div className="border-t border-surface-border pt-8 mt-12">
              <div className="bg-zinc-950-raised border border-surface-border rounded-lg p-8 text-center">
                <h3 className="font-display text-2xl mb-3">
                  Generate your first click track in 2 minutes
                </h3>
                <p className="font-body text-zinc-400 mb-6">
                  Enter your song&apos;s BPM, time signature, and section structure.
                  Get a downloadable click and cue track — no DAW, no catalog required.
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
