/**
 * Sound player + sound library (infrastructure layer).
 *
 * Provides a catalog of start sounds (clicks) and end sounds (electronic
 * chimes/arpeggios/beeps), all synthesized with the Web Audio API (no audio
 * assets bundled). The {@link SoundPlayer} tracks the user's chosen start/end
 * sound (persisted to localStorage), can preview any sound on demand, and plays
 * the selected ones for the timer.
 *
 * Everything is feature-detected: without `AudioContext` (e.g. jsdom under
 * tests) the player degrades to no-ops. Browsers require a user gesture before
 * audio can play, so {@link SoundPlayer.unlock} must be called from a click
 * handler before sound is audible.
 */

export type SoundKind = 'start' | 'end';

export interface SoundDef {
  id: string;
  label: string;
  /** Render the sound into the given context starting at `now`. */
  render: (ctx: AudioContext, now: number) => void;
}

/* -------------------------------------------------------------------------- */
/* Low-level synthesis helpers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Per-context master gain so all sounds share one output stage. The actual
 * level is set per playback by {@link createSoundPlayer} (louder for start
 * clicks, normal for end alarms). Cached per AudioContext.
 */
const START_OUTPUT_GAIN = 2.4; // start clicks: louder
const END_OUTPUT_GAIN = 1.8;  // end alarms/beeps: louder
const masterGains = new WeakMap<AudioContext, GainNode>();
function getMasterGain(ctx: AudioContext): GainNode {
  let g = masterGains.get(ctx);
  if (!g) {
    g = ctx.createGain();
    g.gain.value = 1.0;
    g.connect(ctx.destination);
    masterGains.set(ctx, g);
  }
  return g;
}

/** A single tone with a soft attack/decay envelope. */
function tone(
  ctx: AudioContext,
  start: number,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(getMasterGain(ctx));
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

/** A noise burst through a filter — the basis for clicks/ticks. */
function noiseClick(
  ctx: AudioContext,
  start: number,
  opts: {
    dur?: number;
    type?: BiquadFilterType;
    freq?: number;
    q?: number;
    peak?: number;
  } = {},
): void {
  const dur = opts.dur ?? 0.035;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.type ?? 'lowpass';
  filter.frequency.value = opts.freq ?? 350;
  filter.Q.value = opts.q ?? 0.8;
  const gain = ctx.createGain();
  const peak = opts.peak ?? 0.6;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(getMasterGain(ctx));
  src.start(start);
  src.stop(start + dur + 0.02);
}

/** Play a sequence of notes (for chimes/arpeggios). */
function sequence(
  ctx: AudioContext,
  start: number,
  notes: Array<{ freq: number; at: number; dur: number; peak?: number; type?: OscillatorType }>,
): void {
  for (const n of notes) {
    tone(ctx, start + n.at, n.freq, n.dur, n.peak ?? 0.18, n.type ?? 'sine');
  }
}

/**
 * A weighty low "thump": a sine whose pitch drops from `f0` to `f1`, giving the
 * body/heft of a mechanical clunk. Routed through the shared master output.
 */
function thump(
  ctx: AudioContext,
  start: number,
  f0: number,
  f1: number,
  dur: number,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(getMasterGain(ctx));
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

/* -------------------------------------------------------------------------- */
/* Sound catalog: start sounds (clicks) + end sounds (electronic)              */
/* -------------------------------------------------------------------------- */

export const START_SOUNDS: SoundDef[] = [
  { id: 'low-tock', label: 'Low Tock', render: (c, t) => noiseClick(c, t, { type: 'lowpass', freq: 350, dur: 0.04 }) },
  { id: 'deep-thunk', label: 'Deep Thunk', render: (c, t) => noiseClick(c, t, { type: 'lowpass', freq: 180, q: 1.2, dur: 0.05, peak: 0.7 }) },
  { id: 'soft-clicker', label: 'Soft Clicker', render: (c, t) => noiseClick(c, t, { type: 'lowpass', freq: 500, dur: 0.03, peak: 0.5 }) },
  { id: 'hard-clicker', label: 'Hard Clicker', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 1200, dur: 0.015, peak: 0.55 }) },
  { id: 'pen-click', label: 'Pen Click', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 1500, q: 5, dur: 0.02, peak: 0.5 }) },
  { id: 'snap', label: 'Snap', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 2200, q: 2, dur: 0.02, peak: 0.45 }) },
  { id: 'bright-snap', label: 'Bright Snap', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 3500, dur: 0.012, peak: 0.4 }) },
  { id: 'tick', label: 'Bright Tick', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 1800, dur: 0.02, peak: 0.4 }) },
  { id: 'tic', label: 'Tiny Tic', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 3000, q: 3, dur: 0.012, peak: 0.4 }) },
  { id: 'wood-block', label: 'Wood Block', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 800, q: 3, dur: 0.05, peak: 0.6 }) },
  { id: 'block-hi', label: 'Wood Block (hi)', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 1100, q: 3, dur: 0.03, peak: 0.55 }) },
  { id: 'block-lo', label: 'Wood Block (lo)', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 500, q: 3, dur: 0.045, peak: 0.6 }) },
  { id: 'tap', label: 'Tap', render: (c, t) => noiseClick(c, t, { type: 'lowpass', freq: 250, dur: 0.025, peak: 0.5 }) },
  { id: 'soft-tap', label: 'Soft Tap', render: (c, t) => noiseClick(c, t, { type: 'lowpass', freq: 300, dur: 0.02, peak: 0.35 }) },
  { id: 'knock', label: 'Knock', render: (c, t) => noiseClick(c, t, { type: 'lowpass', freq: 120, q: 1.5, dur: 0.06, peak: 0.8 }) },
  { id: 'clack', label: 'Clack', render: (c, t) => noiseClick(c, t, { type: 'lowpass', freq: 700, q: 0.7, dur: 0.03, peak: 0.6 }) },
  { id: 'ploc', label: 'Ploc', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 600, q: 4, dur: 0.04, peak: 0.55 }) },
  { id: 'rim', label: 'Rim Click', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 2600, q: 6, dur: 0.02, peak: 0.45 }) },
  { id: 'double-tock', label: 'Double Tock', render: (c, t) => { noiseClick(c, t, { type: 'lowpass', freq: 300, dur: 0.035 }); noiseClick(c, t + 0.09, { type: 'lowpass', freq: 300, dur: 0.035 }); } },
  { id: 'double-snap', label: 'Double Snap', render: (c, t) => { noiseClick(c, t, { type: 'bandpass', freq: 2200, q: 2, dur: 0.018, peak: 0.4 }); noiseClick(c, t + 0.08, { type: 'bandpass', freq: 2200, q: 2, dur: 0.018, peak: 0.4 }); } },
  // Pitched variants of the click (same character, different pitch).
  { id: 'click-p1', label: 'Click (lowest)', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 180, q: 4, dur: 0.045, peak: 0.6 }) },
  { id: 'click-p2', label: 'Click (low)', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 300, q: 4, dur: 0.04, peak: 0.6 }) },
  { id: 'click-p3', label: 'Click (mid)', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 500, q: 4, dur: 0.035, peak: 0.55 }) },
  { id: 'click-p4', label: 'Click (high)', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 800, q: 4, dur: 0.03, peak: 0.55 }) },
  { id: 'click-p5', label: 'Click (higher)', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 1200, q: 4, dur: 0.025, peak: 0.5 }) },
  { id: 'click-p6', label: 'Click (highest)', render: (c, t) => noiseClick(c, t, { type: 'bandpass', freq: 1800, q: 4, dur: 0.02, peak: 0.45 }) },
  // Pitched variants of "Bright Tick" (high-pass click; cutoff sets the pitch).
  { id: 'bright-tick-1', label: 'Bright Tick (lowest)', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 1000, dur: 0.02, peak: 0.4 }) },
  { id: 'bright-tick-2', label: 'Bright Tick (low)', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 1400, dur: 0.02, peak: 0.4 }) },
  { id: 'bright-tick-3', label: 'Bright Tick (mid)', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 2200, dur: 0.018, peak: 0.4 }) },
  { id: 'bright-tick-4', label: 'Bright Tick (high)', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 2800, dur: 0.016, peak: 0.4 }) },
  { id: 'bright-tick-5', label: 'Bright Tick (higher)', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 3600, dur: 0.014, peak: 0.38 }) },
  { id: 'bright-tick-6', label: 'Bright Tick (highest)', render: (c, t) => noiseClick(c, t, { type: 'highpass', freq: 4500, dur: 0.012, peak: 0.36 }) },
  // Cassette-deck style mechanical clunks (low thump + latch snap).
  { id: 'cassette-clunk', label: 'Cassette Clunk', render: (c, t) => { tone(c, t, 95, 0.06, 0.18, 'sine'); noiseClick(c, t, { type: 'lowpass', freq: 150, q: 1, dur: 0.06, peak: 0.7 }); noiseClick(c, t + 0.006, { type: 'bandpass', freq: 750, q: 2, dur: 0.025, peak: 0.45 }); } },
  { id: 'cassette-deep', label: 'Cassette Clunk (deep)', render: (c, t) => { tone(c, t, 70, 0.08, 0.2, 'sine'); noiseClick(c, t, { type: 'lowpass', freq: 110, q: 1, dur: 0.08, peak: 0.75 }); noiseClick(c, t + 0.006, { type: 'bandpass', freq: 550, q: 2, dur: 0.03, peak: 0.4 }); } },
  { id: 'cassette-kachunk', label: 'Cassette Ka-Chunk', render: (c, t) => { tone(c, t, 95, 0.05, 0.16, 'sine'); noiseClick(c, t, { type: 'lowpass', freq: 150, dur: 0.05, peak: 0.65 }); noiseClick(c, t + 0.006, { type: 'bandpass', freq: 800, q: 2, dur: 0.02, peak: 0.4 }); noiseClick(c, t + 0.08, { type: 'lowpass', freq: 160, dur: 0.04, peak: 0.5 }); noiseClick(c, t + 0.086, { type: 'bandpass', freq: 900, q: 2, dur: 0.018, peak: 0.35 }); } },
  // Weighted cassette clunks — keep the mechanical latch snap, add modest body.
  { id: 'cassette-clunk-heavy', label: 'Cassette Clunk (heavy)', render: (c, t) => { thump(c, t, 150, 80, 0.07, 0.3); noiseClick(c, t, { type: 'lowpass', freq: 170, dur: 0.05, peak: 0.62 }); noiseClick(c, t + 0.006, { type: 'bandpass', freq: 780, q: 2, dur: 0.022, peak: 0.5 }); } },
  { id: 'cassette-clunk-heavier', label: 'Cassette Clunk (heavier)', render: (c, t) => { thump(c, t, 140, 72, 0.085, 0.36); noiseClick(c, t, { type: 'lowpass', freq: 160, dur: 0.06, peak: 0.66 }); noiseClick(c, t + 0.006, { type: 'bandpass', freq: 720, q: 2, dur: 0.024, peak: 0.5 }); } },
  { id: 'cassette-kachunk-heavy', label: 'Cassette Ka-Chunk (heavy)', render: (c, t) => { thump(c, t, 150, 80, 0.07, 0.3); noiseClick(c, t, { type: 'lowpass', freq: 170, dur: 0.05, peak: 0.6 }); noiseClick(c, t + 0.006, { type: 'bandpass', freq: 780, q: 2, dur: 0.02, peak: 0.46 }); thump(c, t + 0.085, 160, 90, 0.06, 0.24); noiseClick(c, t + 0.085, { type: 'lowpass', freq: 180, dur: 0.045, peak: 0.5 }); noiseClick(c, t + 0.091, { type: 'bandpass', freq: 860, q: 2, dur: 0.018, peak: 0.4 }); } },
  // Lighter cassette clunks — less body, crisper/softer latch snap.
  { id: 'cassette-light', label: 'Cassette Clunk (light)', render: (c, t) => { noiseClick(c, t, { type: 'lowpass', freq: 220, dur: 0.035, peak: 0.4 }); noiseClick(c, t + 0.005, { type: 'bandpass', freq: 950, q: 2, dur: 0.018, peak: 0.4 }); } },
  { id: 'cassette-lighter', label: 'Cassette Clunk (lighter)', render: (c, t) => { noiseClick(c, t, { type: 'lowpass', freq: 280, dur: 0.025, peak: 0.32 }); noiseClick(c, t + 0.004, { type: 'bandpass', freq: 1100, q: 2.5, dur: 0.015, peak: 0.36 }); } },
  { id: 'cassette-kachunk-light', label: 'Cassette Ka-Chunk (light)', render: (c, t) => { noiseClick(c, t, { type: 'lowpass', freq: 220, dur: 0.03, peak: 0.38 }); noiseClick(c, t + 0.005, { type: 'bandpass', freq: 1000, q: 2.5, dur: 0.016, peak: 0.38 }); noiseClick(c, t + 0.07, { type: 'lowpass', freq: 240, dur: 0.025, peak: 0.32 }); noiseClick(c, t + 0.075, { type: 'bandpass', freq: 1150, q: 2.5, dur: 0.014, peak: 0.32 }); } },
];

export const END_SOUNDS: SoundDef[] = [
  // Chimes
  { id: 'gentle-chime', label: 'Gentle Chime', render: (c, t) => sequence(c, t, [{ freq: 440, at: 0, dur: 0.22 }, { freq: 554.37, at: 0.22, dur: 0.22 }, { freq: 659.25, at: 0.44, dur: 0.34 }]) },
  { id: 'soft-chime-hi', label: 'Soft Chime (high)', render: (c, t) => sequence(c, t, [{ freq: 523.25, at: 0, dur: 0.22 }, { freq: 659.25, at: 0.2, dur: 0.22 }, { freq: 783.99, at: 0.4, dur: 0.34 }]) },
  { id: 'glass-chime', label: 'Glass Chime', render: (c, t) => sequence(c, t, [{ freq: 880, at: 0, dur: 0.3, peak: 0.14 }, { freq: 1318.51, at: 0.12, dur: 0.5, peak: 0.12 }]) },
  { id: 'bell-chime', label: 'Bell Chime', render: (c, t) => sequence(c, t, [{ freq: 523.25, at: 0, dur: 0.5, peak: 0.16 }, { freq: 783.99, at: 0.16, dur: 0.5, peak: 0.13 }, { freq: 1046.5, at: 0.32, dur: 0.6, peak: 0.11 }]) },
  // Arpeggios
  { id: 'rising-arp', label: 'Rising Arpeggio', render: (c, t) => sequence(c, t, [{ freq: 523.25, at: 0, dur: 0.14 }, { freq: 659.25, at: 0.14, dur: 0.14 }, { freq: 783.99, at: 0.28, dur: 0.14 }, { freq: 1046.5, at: 0.42, dur: 0.28 }]) },
  { id: 'falling-arp', label: 'Falling Arpeggio', render: (c, t) => sequence(c, t, [{ freq: 1046.5, at: 0, dur: 0.14 }, { freq: 783.99, at: 0.14, dur: 0.14 }, { freq: 659.25, at: 0.28, dur: 0.14 }, { freq: 523.25, at: 0.42, dur: 0.28 }]) },
  { id: 'fast-arp', label: 'Fast Arpeggio', render: (c, t) => sequence(c, t, [{ freq: 587.33, at: 0, dur: 0.09 }, { freq: 739.99, at: 0.09, dur: 0.09 }, { freq: 880, at: 0.18, dur: 0.09 }, { freq: 1174.66, at: 0.27, dur: 0.22 }]) },
  { id: 'wide-arp', label: 'Wide Arpeggio', render: (c, t) => sequence(c, t, [{ freq: 261.63, at: 0, dur: 0.12 }, { freq: 392, at: 0.12, dur: 0.12 }, { freq: 523.25, at: 0.24, dur: 0.12 }, { freq: 659.25, at: 0.36, dur: 0.12 }, { freq: 783.99, at: 0.48, dur: 0.26 }]) },
  // Ding-dongs
  { id: 'ding-dong', label: 'Ding Dong', render: (c, t) => sequence(c, t, [{ freq: 659.25, at: 0, dur: 0.3 }, { freq: 523.25, at: 0.3, dur: 0.45 }]) },
  { id: 'door-chime', label: 'Door Chime', render: (c, t) => sequence(c, t, [{ freq: 783.99, at: 0, dur: 0.4, peak: 0.16 }, { freq: 523.25, at: 0.4, dur: 0.6, peak: 0.16 }]) },
  { id: 'triple-ding', label: 'Triple Ding', render: (c, t) => sequence(c, t, [{ freq: 783.99, at: 0, dur: 0.2 }, { freq: 659.25, at: 0.22, dur: 0.2 }, { freq: 523.25, at: 0.44, dur: 0.4 }]) },
  // Beeps (electronic)
  { id: 'triple-beep', label: 'Triple Beep', render: (c, t) => sequence(c, t, [{ freq: 880, at: 0, dur: 0.12, type: 'square', peak: 0.14 }, { freq: 880, at: 0.2, dur: 0.12, type: 'square', peak: 0.14 }, { freq: 880, at: 0.4, dur: 0.16, type: 'square', peak: 0.14 }]) },
  { id: 'double-beep', label: 'Double Beep', render: (c, t) => sequence(c, t, [{ freq: 988, at: 0, dur: 0.14, type: 'square', peak: 0.14 }, { freq: 988, at: 0.22, dur: 0.18, type: 'square', peak: 0.14 }]) },
  { id: 'beep-up', label: 'Beep Up', render: (c, t) => sequence(c, t, [{ freq: 660, at: 0, dur: 0.14, type: 'square', peak: 0.13 }, { freq: 990, at: 0.16, dur: 0.22, type: 'square', peak: 0.13 }]) },
  { id: 'digital-alert', label: 'Digital Alert', render: (c, t) => sequence(c, t, [{ freq: 1200, at: 0, dur: 0.08, type: 'square', peak: 0.12 }, { freq: 1200, at: 0.12, dur: 0.08, type: 'square', peak: 0.12 }, { freq: 1200, at: 0.24, dur: 0.08, type: 'square', peak: 0.12 }, { freq: 1200, at: 0.36, dur: 0.12, type: 'square', peak: 0.12 }]) },
  { id: 'digital-alert-mid', label: 'Digital Alert (mid)', render: (c, t) => sequence(c, t, [{ freq: 880, at: 0, dur: 0.08, type: 'square', peak: 0.13 }, { freq: 880, at: 0.12, dur: 0.08, type: 'square', peak: 0.13 }, { freq: 880, at: 0.24, dur: 0.08, type: 'square', peak: 0.13 }, { freq: 880, at: 0.36, dur: 0.12, type: 'square', peak: 0.13 }]) },
  { id: 'digital-alert-low', label: 'Digital Alert (low)', render: (c, t) => sequence(c, t, [{ freq: 660, at: 0, dur: 0.08, type: 'square', peak: 0.14 }, { freq: 660, at: 0.12, dur: 0.08, type: 'square', peak: 0.14 }, { freq: 660, at: 0.24, dur: 0.08, type: 'square', peak: 0.14 }, { freq: 660, at: 0.36, dur: 0.12, type: 'square', peak: 0.14 }]) },
  { id: 'digital-alert-deep', label: 'Digital Alert (deep)', render: (c, t) => sequence(c, t, [{ freq: 523.25, at: 0, dur: 0.08, type: 'square', peak: 0.15 }, { freq: 523.25, at: 0.12, dur: 0.08, type: 'square', peak: 0.15 }, { freq: 523.25, at: 0.24, dur: 0.08, type: 'square', peak: 0.15 }, { freq: 523.25, at: 0.36, dur: 0.12, type: 'square', peak: 0.15 }]) },
  { id: 'digital-alert-deepest', label: 'Digital Alert (deepest)', render: (c, t) => sequence(c, t, [{ freq: 392, at: 0, dur: 0.09, type: 'square', peak: 0.16 }, { freq: 392, at: 0.13, dur: 0.09, type: 'square', peak: 0.16 }, { freq: 392, at: 0.26, dur: 0.09, type: 'square', peak: 0.16 }, { freq: 392, at: 0.39, dur: 0.14, type: 'square', peak: 0.16 }]) },
  // Marimba
  { id: 'marimba-roll', label: 'Marimba Roll', render: (c, t) => sequence(c, t, [{ freq: 523.25, at: 0, dur: 0.12 }, { freq: 587.33, at: 0.1, dur: 0.12 }, { freq: 659.25, at: 0.2, dur: 0.12 }, { freq: 783.99, at: 0.3, dur: 0.22 }]) },
  { id: 'marimba-updown', label: 'Marimba Up-Down', render: (c, t) => sequence(c, t, [{ freq: 523.25, at: 0, dur: 0.1 }, { freq: 659.25, at: 0.1, dur: 0.1 }, { freq: 783.99, at: 0.2, dur: 0.1 }, { freq: 659.25, at: 0.3, dur: 0.1 }, { freq: 523.25, at: 0.4, dur: 0.22 }]) },
  { id: 'marimba-chord', label: 'Marimba Chord', render: (c, t) => { tone(c, t, 523.25, 0.5, 0.12); tone(c, t, 659.25, 0.5, 0.1); tone(c, t, 783.99, 0.5, 0.1); } },
  // Two-tone alerts
  { id: 'two-tone', label: 'Two-Tone Alert', render: (c, t) => sequence(c, t, [{ freq: 784, at: 0, dur: 0.18, type: 'triangle', peak: 0.16 }, { freq: 988, at: 0.18, dur: 0.18, type: 'triangle', peak: 0.16 }, { freq: 784, at: 0.36, dur: 0.18, type: 'triangle', peak: 0.16 }, { freq: 988, at: 0.54, dur: 0.24, type: 'triangle', peak: 0.16 }]) },
  { id: 'two-tone-low', label: 'Two-Tone (low)', render: (c, t) => sequence(c, t, [{ freq: 523.25, at: 0, dur: 0.2, type: 'triangle', peak: 0.16 }, { freq: 659.25, at: 0.2, dur: 0.2, type: 'triangle', peak: 0.16 }, { freq: 523.25, at: 0.4, dur: 0.28, type: 'triangle', peak: 0.16 }]) },
];

/* -------------------------------------------------------------------------- */
/* Player                                                                      */
/* -------------------------------------------------------------------------- */

export interface SoundPlayer {
  unlock(): void;
  /** Preview a specific sound by kind + id (always audible). */
  preview(kind: SoundKind, id: string): void;
  /** Play the currently selected start sound. */
  playStart(): void;
  /** Play the currently selected end sound. */
  playAlarm(): void;
  /** Get/set the selected sound id for a kind (persisted). */
  getSelection(kind: SoundKind): string;
  setSelection(kind: SoundKind, id: string): void;
  /** Get/set master volume 0–1 (persisted). */
  getVolume(): number;
  setVolume(v: number): void;
  dispose(): void;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const STORAGE_KEY = { start: 'timeTracker.sound.start', end: 'timeTracker.sound.end', volume: 'timeTracker.sound.volume' };
const DEFAULT_SELECTION: Record<SoundKind, string> = {
  start: 'low-tock',
  end: 'gentle-chime',
};
const DEFAULT_VOLUME = 1.0;

/** Seconds ahead of `AudioContext.currentTime` to schedule audio, avoiding glitches. */
const AUDIO_LOOKAHEAD_SEC = 0.02;

function catalog(kind: SoundKind): SoundDef[] {
  return kind === 'start' ? START_SOUNDS : END_SOUNDS;
}

export function createSoundPlayer(): SoundPlayer {
  const Ctor = getAudioContextCtor();
  let ctx: AudioContext | null = null;

  const selection: Record<SoundKind, string> = {
    start: readPersisted('start'),
    end: readPersisted('end'),
  };

  let volume: number = readPersistedVolume();

  function readPersisted(kind: SoundKind): string {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY[kind]);
      if (v && catalog(kind).some((s) => s.id === v)) return v;
    } catch {
      /* ignore */
    }
    return DEFAULT_SELECTION[kind];
  }

  function readPersistedVolume(): number {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY.volume);
      if (v !== null) {
        const n = parseFloat(v);
        if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
      }
    } catch { /* ignore */ }
    return DEFAULT_VOLUME;
  }

  function ensureCtx(): AudioContext | null {
    if (!Ctor) return null;
    if (!ctx) {
      try {
        ctx = new Ctor();
      } catch {
        ctx = null;
      }
    }
    return ctx;
  }

  function play(kind: SoundKind, id: string): void {
    const audio = ensureCtx();
    if (!audio) return;
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    // Apply master volume, then kind-specific output gain on top.
    const kindGain = kind === 'start' ? START_OUTPUT_GAIN : END_OUTPUT_GAIN;
    getMasterGain(audio).gain.value = volume * kindGain;
    const def = catalog(kind).find((s) => s.id === id) ?? catalog(kind)[0];
    try {
      def.render(audio, audio.currentTime + AUDIO_LOOKAHEAD_SEC);
    } catch {
      /* ignore synthesis errors */
    }
  }

  return {
    unlock(): void {
      const audio = ensureCtx();
      if (audio && audio.state === 'suspended') void audio.resume().catch(() => {});
    },
    preview(kind, id) {
      play(kind, id);
    },
    playStart() {
      play('start', selection.start);
    },
    playAlarm() {
      play('end', selection.end);
    },
    getSelection(kind) {
      return selection[kind];
    },
    setSelection(kind, id) {
      selection[kind] = id;
      try {
        window.localStorage.setItem(STORAGE_KEY[kind], id);
      } catch {
        /* ignore */
      }
    },
    getVolume() {
      return volume;
    },
    setVolume(v: number) {
      volume = Math.max(0, Math.min(1, v));
      // Update live gain if context exists.
      if (ctx) getMasterGain(ctx).gain.value = volume;
      try {
        window.localStorage.setItem(STORAGE_KEY.volume, String(volume));
      } catch { /* ignore */ }
    },
    dispose() {
      if (ctx) {
        void ctx.close().catch(() => {});
        ctx = null;
      }
    },
  };
}

/** A no-op sound player for tests or when sound is disabled. */
export function createNoopSoundPlayer(): SoundPlayer {
  const selection: Record<SoundKind, string> = { ...DEFAULT_SELECTION };
  let volume = DEFAULT_VOLUME;
  return {
    unlock: () => {},
    preview: () => {},
    playStart: () => {},
    playAlarm: () => {},
    getSelection: (kind) => selection[kind],
    setSelection: (kind, id) => { selection[kind] = id; },
    getVolume: () => volume,
    setVolume: (v) => { volume = v; },
    dispose: () => {},
  };
}
