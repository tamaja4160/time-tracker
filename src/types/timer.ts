/**
 * Timer domain types and the pure TimerEngine state machine interface.
 * See design "Components and Interfaces > TimerEngine".
 */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

/** The transition that was last attempted on the timer. */
export type TimerTransitionAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'tick'
  | 'reset'
  | 'setDuration';

/** Why a transition was not applicable to the current state. */
export type TimerTransitionReason = 'not_applicable' | 'already_running';

/**
 * Transient indication describing the outcome of the most recent transition.
 *
 * Used to surface "not applicable / already running" feedback for invalid
 * transitions (Req 3.2, 4.5, 4.6 / design Property 6) without throwing. It is
 * an OPTIONAL field so existing code and tests are unaffected; it never changes
 * the `status`/`remainingSec` semantics of a state.
 */
export interface TimerTransitionOutcome {
  action: TimerTransitionAction;
  applicable: boolean;
  reason?: TimerTransitionReason;
}

export interface TimerState {
  status: TimerStatus;
  configuredDurationSec: number; // 1..999 * 60, always valid
  remainingSec: number; // 0..configuredDurationSec
  // Internal bookkeeping for wall-clock countdown:
  endEpochMs: number | null; // target end time while running
  pausedRemainingSec: number | null;
  sessionStartEpochMs: number | null; // for Log_Entry start time
  sessionEndEpochMs: number | null; // set when Completed
  usingDefaultFallback: boolean; // Req 1.5 / 2.5 indication
  // Transient outcome of the most recent transition (optional; see above).
  lastTransition?: TimerTransitionOutcome;
}

export interface TimerEngine {
  init(configuredDurationSec: number): TimerState;
  setDuration(state: TimerState, minutes: unknown): TimerState; // validates 1..999
  start(state: TimerState, nowMs: number): TimerState;
  pause(state: TimerState, nowMs: number): TimerState;
  resume(state: TimerState, nowMs: number): TimerState;
  reset(state: TimerState): TimerState;
  tick(state: TimerState, nowMs: number): TimerState; // recompute remaining; may transition to completed
}
