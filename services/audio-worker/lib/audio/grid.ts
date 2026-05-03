/**
 * Time grid calculator for Cue Track.
 * Converts a SongSpec into a sample-accurate TimeGrid with beat positions and cue events.
 */

import type { SongSpec, TimeGrid, BeatPosition, CueEvent, SongSection, TimeSignature } from './types.ts';

/**
 * Build a complete time grid from a song specification.
 * Walks through every section, bar, and beat, computing exact sample positions.
 * Generates cue events for section announcements, count-ins, and bar countdowns.
 *
 * @param spec - The song specification
 * @param sampleRate - Audio sample rate (typically 44100)
 * @returns TimeGrid with beats, cues, section boundaries, and total duration info
 */
export function buildTimeGrid(spec: SongSpec, sampleRate: number): TimeGrid {
  const beats: BeatPosition[] = [];
  const cues: CueEvent[] = [];
  const sectionBoundaries: TimeGrid['sectionBoundaries'] = [];

  let currentSample = 0;
  let globalBarNumber = 1;

  // First, handle count-in bars before the song starts
  if (spec.enableCountIn && spec.countInBars > 0) {
    const bpm = spec.bpm;
    const ts = spec.timeSignature;
    const samplesPerBeat = Math.round((sampleRate * 60) / bpm);

    for (let countBar = 0; countBar < spec.countInBars; countBar++) {
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

        // Generate count-in cue events on each beat of the count-in
        cues.push({
          type: 'count_in',
          sampleIndex,
          text: String(beat),
          sectionName: spec.sections.length > 0 ? spec.sections[0].name : '',
        });

        currentSample += samplesPerBeat;
      }
    }
  }

  // Walk through each section
  for (let sectionIdx = 0; sectionIdx < spec.sections.length; sectionIdx++) {
    const section = spec.sections[sectionIdx];
    const bpm = section.bpmOverride ?? spec.bpm;
    const ts = section.timeSignatureOverride ?? spec.timeSignature;
    const samplesPerBeat = Math.round((sampleRate * 60) / bpm);
    const sectionStartSample = Math.round(currentSample);

    // Record section boundary
    sectionBoundaries.push({
      sampleIndex: sectionStartSample,
      sectionName: section.name,
      sectionIndex: sectionIdx,
    });

    // Section announce cue: placed one bar BEFORE section transition.
    // For the first section, place at sample 0 (or at count-in start).
    if (spec.enableSectionAnnounce) {
      if (sectionIdx === 0) {
        // First section: announce at the very start
        cues.push({
          type: 'section_announce',
          sampleIndex: 0,
          text: section.name,
          sectionName: section.name,
        });
      }
      // Announcements for subsequent sections are placed by the PREVIOUS section's logic below
    }

    // Calculate the sample position one bar before the END of this section
    // (which is one bar before the NEXT section starts)
    const samplesPerBar = samplesPerBeat * ts.beats;

    // Walk through each bar in this section
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

      // Bar countdown: announce remaining bars starting 4 bars before transition
      if (spec.enableBarCountdown) {
        const barsRemaining = section.bars - bar;
        if (barsRemaining > 0 && barsRemaining <= 4) {
          // Place at the downbeat of this bar (which we just finished generating beats for)
          const barStartSample = Math.round(currentSample - samplesPerBar);
          cues.push({
            type: 'bar_countdown',
            sampleIndex: barStartSample,
            text: `${barsRemaining} bar${barsRemaining === 1 ? '' : 's'}`,
            sectionName: section.name,
          });
        }
      }

      // Section announce for the NEXT section: place one bar before this section ends
      if (spec.enableSectionAnnounce && sectionIdx < spec.sections.length - 1) {
        if (bar === section.bars) {
          // This is the last bar of the current section.
          // Place the next section's announcement at the start of this bar.
          const lastBarStart = Math.round(currentSample - samplesPerBar);
          const nextSection = spec.sections[sectionIdx + 1];
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
