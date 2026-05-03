/**
 * Audio engine types — self-contained for the Cloud Run worker.
 * No external dependencies; mirrors the relevant subset of the main project's
 * types/index.ts so this directory can be packaged and deployed independently.
 */

export interface SongSection {
  id: string;
  name: string;
  bars: number;
  bpmOverride?: number;
  timeSignatureOverride?: TimeSignature;
}

export interface TimeSignature {
  beats: number;
  subdivision: number;
}

export interface SongSpec {
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  sections: SongSection[];
  voiceId: string;
  clickSound: 'classic' | 'woodblock' | 'rimshot' | 'hi-hat';
  format: 'wav' | 'mp3';
  enableCountIn: boolean;
  enableSectionAnnounce: boolean;
  enableBarCountdown: boolean;
  countInBars: number;
}

export interface ClickConfig {
  downbeatFreq: number;
  regularFreq: number;
  clickDuration: number;
  accentGain: number;
  regularGain: number;
  sampleRate: number;
}

export interface BeatPosition {
  sampleIndex: number;
  isDownbeat: boolean;
  beatNumber: number;
  barNumber: number;
  globalBarNumber: number;
  sectionIndex: number;
  sectionName: string;
}

export interface CueEvent {
  type: 'section_announce' | 'count_in' | 'bar_countdown';
  sampleIndex: number;
  text: string;
  sectionName: string;
}

export interface TimeGrid {
  beats: BeatPosition[];
  cues: CueEvent[];
  totalSamples: number;
  totalDuration: number;
  sectionBoundaries: { sampleIndex: number; sectionName: string; sectionIndex: number }[];
}

export interface RenderResult {
  fullTrack: Buffer;
  preview: Buffer;
  format: 'wav' | 'mp3';
  duration: number;
  sampleRate: number;
  spec: SongSpec;
}

export type ClickSoundType = 'classic' | 'woodblock' | 'rimshot' | 'hi-hat';
export type OutputFormat = 'wav' | 'mp3';
export type VoiceId =
  | 'en-US-Studio-M'
  | 'en-US-Studio-O'
  | 'en-US-Neural2-D'
  | 'en-US-Neural2-F'
  | 'en-US-Casual-K';

export const AVAILABLE_VOICES: { id: VoiceId; label: string; description: string }[] = [
  { id: 'en-US-Studio-M', label: 'Studio Male', description: 'Male, authoritative' },
  { id: 'en-US-Studio-O', label: 'Studio Female', description: 'Female, clear' },
  { id: 'en-US-Neural2-D', label: 'Neural Male', description: 'Male, natural' },
  { id: 'en-US-Neural2-F', label: 'Neural Female', description: 'Female, natural' },
  { id: 'en-US-Casual-K', label: 'Casual Male', description: 'Male, casual' },
];

export const DEFAULT_SAMPLE_RATE = 44100;

export interface MixParams {
  grid: TimeGrid;
  clickSamples: { downbeat: Float32Array; regular: Float32Array };
  cueSamples: Map<string, Float32Array>;
  sampleRate: number;
  clickGainDb: number;
  cueGainDb: number;
}
