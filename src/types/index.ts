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

/**
 * A spoken cue placed in the rendered track.
 *
 * Cue types:
 * - 'section_announce': single utterance of the section name. Fires at sample 0
 *   for the first section when no count-in pre-roll is configured, or one bar
 *   before each subsequent section when count-in is disabled.
 * - 'count_in': single beat-digit (e.g. "1", "2", "3", "4"), emitted on each
 *   beat of the count-in bars before the song starts.
 * - 'bar_countdown': "N bar(s)" countdown placed at the downbeat of each bar
 *   in the four-bar window before a section transition.
 * - 'section_count_in': a SEQUENCE of atomic cues spanning one bar, conveying
 *   the upcoming section name on beat 1 followed by the count digits on beats
 *   2..N. Each cue in the sequence is independent: the cueSamples map is keyed
 *   by `text`, so the mixer treats each entry as a standard single-text cue.
 *
 *   For mid-song transitions (sectionIdx >= 1) and for the intro when
 *   countInBars === 1, the grid emits one section_count_in cue per beat of the
 *   target bar. Example for a 4/4 transition into "Chorus":
 *     { type: 'section_count_in', text: 'Chorus', sectionName: 'Chorus', ... }
 *     { type: 'section_count_in', text: '2',      sectionName: 'Chorus', ... }
 *     { type: 'section_count_in', text: '3',      sectionName: 'Chorus', ... }
 *     { type: 'section_count_in', text: '4',      sectionName: 'Chorus', ... }
 *
 *   The atomic decomposition is intentional: engine.ts collects unique cue
 *   texts via `uniqueTexts.add(cue.text)`, and mixer.ts looks each cue up by
 *   `cue.text`. Splitting into atomic cues means neither file needs to learn
 *   the compound-cue shape. The `section_count_in` type label is preserved so
 *   downstream consumers (debug tools, future per-cue volume control, etc.)
 *   can still distinguish transition-count cues from regular count-in cues.
 */
export interface CueEvent {
  type: 'section_announce' | 'count_in' | 'bar_countdown' | 'section_count_in';
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
  /**
   * True when the caller has access to the full (non-preview) audio: either
   * a paid purchase exists for this track, or the owner is on an active Pro
   * subscription. Set by GET /api/tracks/[id]; omitted from list responses.
   */
  hasAccess?: boolean;
  /**
   * True when the caller can still claim their one free track (the "first one's
   * on us" offer). Set by GET /api/tracks/[id]; false once they've used it.
   */
  freeEligible?: boolean;
}

export interface TracksListResponse {
  tracks: TrackRecord[];
  isPro: boolean;
  stripeCustomerId: string | null;
}

export interface PurchaseRecord {
  id: string;
  trackId: string;
  /** Payment provider: 'stripe' or 'paypal'. */
  provider: 'stripe' | 'paypal';
  /** Stripe checkout session id (null for PayPal purchases). */
  stripeSessionId: string | null;
  stripePaymentIntent: string | null;
  /** PayPal order id (null for Stripe purchases). */
  paypalOrderId: string | null;
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
