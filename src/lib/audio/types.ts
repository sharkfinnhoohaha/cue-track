/**
 * Audio-internal types for the Cue Track engine.
 * Re-exports relevant types from the main types file and adds audio-specific ones.
 */

import type {
  SongSpec,
  SongSection,
  TimeSignature,
  BeatPosition,
  CueEvent,
  TimeGrid,
  ClickConfig,
  RenderResult,
} from '../../types';

export type {
  SongSpec,
  SongSection,
  TimeSignature,
  BeatPosition,
  CueEvent,
  TimeGrid,
  ClickConfig,
  RenderResult,
};

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
