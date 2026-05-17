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
  | 'en-US-Standard-D'
  | 'en-US-Standard-J'
  | 'en-US-Studio-M'
  | 'en-US-Studio-O'
  | 'en-US-Neural2-D'
  | 'en-US-Neural2-F'
  | 'en-US-Casual-K';

/**
 * Voice tier governs unit economics. Standard voices are billed at $4/M
 * characters and are the default free-tier surface. Studio voices are
 * billed at $160/M characters and require an active Pro subscription;
 * the generate route enforces this at submit time. The form continues
 * to show all options so the upsell remains visible.
 */
export type VoiceTier = 'standard' | 'studio';

export interface AvailableVoice {
  id: VoiceId;
  label: string;
  description: string;
  tier: VoiceTier;
}

export const AVAILABLE_VOICES: AvailableVoice[] = [
  { id: 'en-US-Standard-D', label: 'Standard Male', description: 'Male, neutral (free)', tier: 'standard' },
  { id: 'en-US-Standard-J', label: 'Standard Female', description: 'Female, neutral (free)', tier: 'standard' },
  { id: 'en-US-Studio-M', label: 'Studio Male', description: 'Male, authoritative (Pro)', tier: 'studio' },
  { id: 'en-US-Studio-O', label: 'Studio Female', description: 'Female, clear (Pro)', tier: 'studio' },
  { id: 'en-US-Neural2-D', label: 'Neural Male', description: 'Male, natural (Pro)', tier: 'studio' },
  { id: 'en-US-Neural2-F', label: 'Neural Female', description: 'Female, natural (Pro)', tier: 'studio' },
  { id: 'en-US-Casual-K', label: 'Casual Male', description: 'Male, casual (Pro)', tier: 'studio' },
];

/**
 * Resolve a voice's tier. Unknown voiceIds default to 'studio' (fail-closed)
 * so a typo cannot accidentally widen the free surface.
 */
export function getVoiceTier(voiceId: string): VoiceTier {
  const found = AVAILABLE_VOICES.find((v) => v.id === voiceId);
  return found?.tier ?? 'studio';
}

export const DEFAULT_SAMPLE_RATE = 44100;

export interface MixParams {
  grid: TimeGrid;
  clickSamples: { downbeat: Float32Array; regular: Float32Array };
  cueSamples: Map<string, Float32Array>;
  sampleRate: number;
  clickGainDb: number;
  cueGainDb: number;
}
