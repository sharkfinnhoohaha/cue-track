/**
 * Time grid calculator for Cue Track.
 * Converts a SongSpec into a sample-accurate TimeGrid with beat positions and cue events.
 */

import type { SongSpec, TimeGrid, BeatPosition, CueEvent } from './types';

/**
 * Constructs a sample-accurate TimeGrid for the provided song specification.
 *
 * Generates per-beat positions and timed cue events (section announcements, count-ins,
 * bar countdowns, and `section_count_in` patterns), plus section boundaries and overall duration.
 *
 * @param spec - Song specification (sections, tempo, time signatures, and cue/count-in settings)
 * @param sampleRate - Audio sample rate in Hz used to convert beats/bars to sample indices
 * @returns A TimeGrid containing:
 *  - `beats`: an array of per-beat `BeatPosition` entries with sample indices, beat/bar numbers, downbeat flags, and section info
 *  - `cues`: time-ordered `CueEvent` entries for section announces, count-ins, bar countdowns, and `section_count_in` patterns
 *  - `sectionBoundaries`: start sample indices and metadata for each section
 *  - `totalSamples`: total number of samples in the generated grid
 *  - `totalDuration`: total duration in seconds (derived from `totalSamples` / `sampleRate`)
 */
export function buildTimeGrid(spec: SongSpec, sampleRate: number): TimeGrid {
  const beats: BeatPosition[] = [];
  const cues: CueEvent[] = [];
  const sectionBoundaries: TimeGrid['sectionBoundaries'] = [];

  let currentSample = 0;
  let globalBarNumber = 1;

  // ---------------------------------------------------------------------
  // Intro pre-roll behavior (count-in bars before the song starts)
  // ---------------------------------------------------------------------

  const introSectionName = spec.sections.length > 0 ? spec.sections[0].name : '';
  const hasCountIn = spec.enableCountIn && spec.countInBars > 0;
  const hasIntroAnnounce = spec.enableSectionAnnounce && introSectionName.length > 0;

  // section_count_in pattern on the single count-in bar: section name on beat 1,
  // digit count on beats 2..N. Matches the "chorus, 2, 3, 4" grammar from the
  // product spec when there is only room for a single bar of pre-roll.
  const compactIntro = hasCountIn && hasIntroAnnounce && spec.countInBars === 1;

  // Split mode: bar 1 of count-in carries a plain section_announce on beat 1,
  // beats 2..N of bar 1 are silent of speech, remaining count-in bars carry
  // standard digit count_in cues per beat. This matches the "(spoken cue is 2
  // bars before start), 1, 2, 3, 4" grammar from the product spec when there
  // is enough room for a dedicated announce bar plus a count-in bar.
  const splitIntro = hasCountIn && hasIntroAnnounce && spec.countInBars >= 2;

  if (hasCountIn) {
    const bpm = spec.bpm;
    const ts = spec.timeSignature;
    const samplesPerBeat = Math.round((sampleRate * 60) / bpm);

    for (let countBar = 0; countBar < spec.countInBars; countBar++) {
      const isFirstCountBar = countBar === 0;
      const isLastCountBar = countBar === spec.countInBars - 1;

      for (let beat = 1; beat <= ts.beats; beat++) {
        const sampleIndex = Math.round(currentSample);

        beats.push({
          sampleIndex,
          isDownbeat: beat === 1,
          beatNumber: beat,
          barNumber: countBar + 1,
          globalBarNumber: 0, // 0 indicates count-in bar
          sectionIndex: -1,
          sectionName: '__count_in__',
        });

        // Cue emission for this beat
        if (compactIntro) {
          // section_count_in pattern: section name on beat 1, digits on beats 2..N
          cues.push({
            type: 'section_count_in',
            sampleIndex,
            text: beat === 1 ? introSectionName : String(beat),
            sectionName: introSectionName,
          });
        } else if (splitIntro && isFirstCountBar) {
          // First count-in bar in split mode: announce the section on beat 1, silence after
          if (beat === 1) {
            cues.push({
              type: 'section_announce',
              sampleIndex,
              text: introSectionName,
              sectionName: introSectionName,
            });
          }
          // beats 2..N of the first count-in bar emit no spoken cue (click only)
        } else if (splitIntro && isLastCountBar) {
          // Final count-in bar in split mode: standard digit count-in
          cues.push({
            type: 'count_in',
            sampleIndex,
            text: String(beat),
            sectionName: introSectionName,
          });
        } else if (splitIntro) {
          // Middle count-in bars in split mode (only possible when countInBars >= 3): click only
          // No spoken cue. Empty intentionally.
        } else {
          // Standard digit count-in (no announce, or countIn=true & announce=false)
          cues.push({
            type: 'count_in',
            sampleIndex,
            text: String(beat),
            sectionName: introSectionName,
          });
        }

        currentSample += samplesPerBeat;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Section walk
  // ---------------------------------------------------------------------

  for (let sectionIdx = 0; sectionIdx < spec.sections.length; sectionIdx++) {
    const section = spec.sections[sectionIdx];
    const bpm = section.bpmOverride ?? spec.bpm;
    const ts = section.timeSignatureOverride ?? spec.timeSignature;
    const samplesPerBeat = Math.round((sampleRate * 60) / bpm);
    const samplesPerBar = samplesPerBeat * ts.beats;
    const sectionStartSample = Math.round(currentSample);

    sectionBoundaries.push({
      sampleIndex: sectionStartSample,
      sectionName: section.name,
      sectionIndex: sectionIdx,
    });

    // First-section announcement at sample 0 is only emitted when there is NO
    // intro pre-roll pattern. The count-in loop above has already emitted the
    // announcement if compactIntro or splitIntro fired.
    if (sectionIdx === 0 && hasIntroAnnounce && !compactIntro && !splitIntro) {
      cues.push({
        type: 'section_announce',
        sampleIndex: 0,
        text: section.name,
        sectionName: section.name,
      });
    }

    for (let bar = 1; bar <= section.bars; bar++) {
      for (let beat = 1; beat <= ts.beats; beat++) {
        const sampleIndex = Math.round(currentSample);

        beats.push({
          sampleIndex,
          isDownbeat: beat === 1,
          beatNumber: beat,
          barNumber: bar,
          globalBarNumber,
          sectionIndex: sectionIdx,
          sectionName: section.name,
        });

        currentSample += samplesPerBeat;
      }

      // Bar countdown: "N bar(s)" cues in the last four bars of every section.
      // Unchanged from prior behavior. Fires at the downbeat of bars where
      // barsRemaining is in [1, 4]. The last bar of the section is not
      // counted because barsRemaining would be 0.
      if (spec.enableBarCountdown) {
        const barsRemaining = section.bars - bar;
        if (barsRemaining > 0 && barsRemaining <= 4) {
          const barStartSample = Math.round(currentSample - samplesPerBar);
          cues.push({
            type: 'bar_countdown',
            sampleIndex: barStartSample,
            text: `${barsRemaining} bar${barsRemaining === 1 ? '' : 's'}`,
            sectionName: section.name,
          });
        }
      }

      // Section announcement for the NEXT section: placed in the last bar of
      // the current section. Emission shape depends on whether count-in is
      // enabled:
      //   enableCountIn: section_count_in pattern (section name + count) across
      //                  the full bar, atomic cues per beat.
      //   !enableCountIn: single section_announce cue at the downbeat of the bar.
      if (
        spec.enableSectionAnnounce &&
        sectionIdx < spec.sections.length - 1 &&
        bar === section.bars
      ) {
        const lastBarStart = Math.round(currentSample - samplesPerBar);
        const nextSection = spec.sections[sectionIdx + 1];

        if (spec.enableCountIn) {
          // Atomic section_count_in cues across the last bar. The "next section
          // ts" is the destination's time signature, since the cue is announcing
          // the upcoming section's downbeat. But the cues themselves are placed
          // at the current section's beat positions (which we already have).
          // Beat 1 says the next section name; beats 2..N say the digits.
          for (let b = 1; b <= ts.beats; b++) {
            const beatSample = lastBarStart + (b - 1) * samplesPerBeat;
            cues.push({
              type: 'section_count_in',
              sampleIndex: beatSample,
              text: b === 1 ? nextSection.name : String(b),
              sectionName: nextSection.name,
            });
          }
        } else {
          cues.push({
            type: 'section_announce',
            sampleIndex: lastBarStart,
            text: nextSection.name,
            sectionName: nextSection.name,
          });
        }
      }

      globalBarNumber++;
    }
  }

  const totalSamples = Math.round(currentSample);
  const totalDuration = totalSamples / sampleRate;

  // Sort cues by sample position for consistent processing
  cues.sort((a, b) => a.sampleIndex - b.sampleIndex);

  return {
    beats,
    cues,
    totalSamples,
    totalDuration,
    sectionBoundaries,
  };
}
