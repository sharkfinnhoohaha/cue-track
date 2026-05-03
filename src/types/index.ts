export interface SongSection {
  id: string;
  name: string;
  bars: number;
  // Optional overrides per section
  bpmOverride?: number;
  timeSignatureOverride?: TimeSignature;
}

export interface TimeSignature {
  beats: number;       // numerator (e.g. 4)
  subdivision: number; // denominator (e.g. 4)
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
  countInBars: number; // typically 1 or 2
}

export interface ClickConfig {
  downbeatFreq: number;   // Hz, e.g. 880
  regularFreq: number;    // Hz, e.g. 440
  clickDuration: number;  // seconds, e.g. 0.01
  accentGain: number;     // e.g. 1.0 for downbeat
  regularGain: number;    // e.g. 0.7 for regular beats
  sampleRate: number;     // 44100
}

export interface BeatPosition {
  sampleIndex: number;
  isDownbeat: boolean;
  beatNumber: number;      // 1-indexed within bar
  barNumber: number;       // 1-indexed within section
  globalBarNumber: number; // 1-indexed across entire song
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
  totalDuration: number; // seconds
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

export type TrackStatus = 'rendering' | 'ready' | 'failed';
export type PurchaseStatus = 'pending' | 'paid' | 'refunded';
export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled';

// --- API response shapes ---

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export interface TrackRecord {
  id: string;
  title: string;
  spec: SongSpec;
  status: TrackStatus;
  previewUrl: string | null;
  fullUrl: string | null;
  duration: number | null;
  createdAt: string;
  email: string | null;
  userId: string | null;
}

export interface PurchaseRecord {
  id: string;
  trackId: string;
  stripeSessionId: string;
  stripePaymentIntent: string | null;
  status: PurchaseStatus;
  email: string;
  amountCents: number;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  stripeCustomerId: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionId: string | null;
  createdAt: string;
}

export interface PresetRecord {
  id: string;
  userId: string;
  name: string;
  spec: SongSpec;
  createdAt: string;
}

// --- Form / UI state shapes ---

export interface CreateFormState {
  spec: SongSpec;
  step: 'details' | 'sections' | 'options' | 'review';
  isSubmitting: boolean;
  error: string | null;
}

export type ClickSoundOption = {
  id: SongSpec['clickSound'];
  label: string;
  description: string;
};

export type FormatOption = {
  id: SongSpec['format'];
  label: string;
  description: string;
};

// --- Pricing ---

export type PlanId = 'single' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // cents
  description: string;
  features: string[];
  stripePriceId: string;
}
