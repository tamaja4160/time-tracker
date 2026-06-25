/**
 * TimerEngine (pure state machine).
 *
 * Framework-independent implementation of the timer state machine described in
 * design "Components and Interfaces > TimerEngine". No DOM, no `Date.now()`
 * inside (wall-clock time is injected via `nowMs`), no network.
 *
 * This file implements `init`, `setDuration`, `reset` (task 4.1), `start` /
 * `tick` with completion handling (task 4.4), and the `pause` / `resume`
 * transitions with not-applicable indications (task 4.7).
 *
 * Requirements covered here: 1.2, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.2,
 * 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 6.3.
 */

import type { TimerEngine, TimerState } from '../types/timer';
import { parseDuration } from './validation';

/** Default_Duration: 15 minutes = 900 seconds (Req 2.2). */
export const DEFAULT_DURATION_SEC = 15 * 60;

const SECONDS_PER_MINUTE = 60;

/**
 * A configured duration (in seconds) is valid iff it represents a whole number
 * of minutes in [1, 999] inclusive — i.e. it is an integer, divisible by 60,
 * and its minute value passes `parseDuration`.
 */
function isValidConfiguredDurationSec(sec: number): boolean {
  if (!Number.isInteger(sec) || sec % SECONDS_PER_MINUTE !== 0) {
    return false;
  }
  return parseDuration(sec / SECONDS_PER_MINUTE).ok;
}

/**
 * Build an idle TimerState for the given configured duration in seconds. All
 * session bookkeeping fields are cleared.
 */
function makeIdleState(
  configuredDurationSec: number,
  usingDefaultFallback: boolean,
): TimerState {
  return {
    status: 'idle',
    configuredDurationSec,
    remainingSec: configuredDurationSec,
    endEpochMs: null,
    pausedRemainingSec: null,
    sessionStartEpochMs: null,
    sessionEndEpochMs: null,
    usingDefaultFallback,
  };
}

/**
 * Create the initial idle timer state.
 *
 * Returns an idle state whose `remainingSec` equals the configured duration
 * (Req 1.2, 2.3). If `configuredDurationSec` is not a whole number of minutes
 * in [1, 999], the engine falls back to the Default_Duration of 900 seconds and
 * marks `usingDefaultFallback` true (Req 1.5 / 2.5); otherwise the flag is false.
 */
function init(configuredDurationSec: number): TimerState {
  if (isValidConfiguredDurationSec(configuredDurationSec)) {
    return makeIdleState(configuredDurationSec, false);
  }
  return makeIdleState(DEFAULT_DURATION_SEC, true);
}

/**
 * Set the configured duration from a minutes input, validated via
 * `parseDuration` (Req 2.1, 2.3, 2.4, 2.6).
 *
 * On a valid input: update `configuredDurationSec` to `minutes * 60`, clear the
 * default-fallback flag, and — while the timer is idle/not running — update
 * `remainingSec` to match so the idle display tracks the new duration. Duration
 * changes only apply while idle (Req 2.1); a running or paused timer keeps its
 * `remainingSec`/`status` untouched and only its configured duration is updated.
 *
 * On an invalid input: retain the previous `configuredDurationSec` unchanged
 * (Req 2.4). If the previous configured duration is itself invalid or unset,
 * fall back to the Default_Duration of 900 seconds and mark
 * `usingDefaultFallback` true (Req 2.5).
 */
function setDuration(state: TimerState, minutes: unknown): TimerState {
  const parsed = parseDuration(minutes);

  if (parsed.ok) {
    const newConfiguredSec = parsed.minutes * SECONDS_PER_MINUTE;
    const isIdle = state.status === 'idle';
    return {
      ...state,
      configuredDurationSec: newConfiguredSec,
      // Only adjust remaining while idle/not running; running/paused timers are
      // left untouched (duration changes apply when idle, Req 2.1).
      remainingSec: isIdle ? newConfiguredSec : state.remainingSec,
      usingDefaultFallback: false,
    };
  }

  // Invalid input: keep the previous configured duration if it is valid.
  if (isValidConfiguredDurationSec(state.configuredDurationSec)) {
    return state;
  }

  // Previous configured duration is also invalid/unset: fall back to default.
  const isIdle = state.status === 'idle';
  return {
    ...state,
    configuredDurationSec: DEFAULT_DURATION_SEC,
    remainingSec: isIdle ? DEFAULT_DURATION_SEC : state.remainingSec,
    usingDefaultFallback: true,
  };
}

/**
 * Reset the timer to a clean not-running (idle) state (Req 5.1, 5.2, 5.3).
 *
 * Stops counting, sets `remainingSec` equal to `configuredDurationSec`, clears
 * all session bookkeeping (`endEpochMs`, `pausedRemainingSec`,
 * `sessionStartEpochMs`, `sessionEndEpochMs`), and creates NO log entry. The
 * resulting idle state is stable: subsequent ticks will not change remaining
 * time or status until a new session is started (tick enforces this in 4.4).
 * The `usingDefaultFallback` indication is preserved as-is.
 */
function reset(state: TimerState): TimerState {
  return {
    ...state,
    status: 'idle',
    remainingSec: state.configuredDurationSec,
    endEpochMs: null,
    pausedRemainingSec: null,
    sessionStartEpochMs: null,
    sessionEndEpochMs: null,
  };
}

const MS_PER_SECOND = 1000;

/**
 * Begin a new Session from the idle (not-running) state (Req 3.1).
 *
 * Transitions idle -> running: anchors the session to wall-clock time by
 * setting `sessionStartEpochMs = nowMs` and the scheduled completion instant
 * `endEpochMs = nowMs + configuredDurationSec * 1000`, and starts the countdown
 * at the full `configuredDurationSec`. Any stale pause/end bookkeeping is
 * cleared so the running session is clean.
 *
 * `start` is only valid from idle. Activating the Timer while a Session is
 * already running/paused/completed leaves the remaining time and status
 * unchanged and carries an `already_running` not-applicable indication via the
 * transient `lastTransition` field (Req 3.2 / Property 6). Keeping the state
 * otherwise unchanged keeps the engine pure and idempotent for non-idle inputs.
 */
function start(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'idle') {
    return {
      ...state,
      lastTransition: {
        action: 'start',
        applicable: false,
        reason: 'already_running',
      },
    };
  }
  return {
    ...state,
    status: 'running',
    remainingSec: state.configuredDurationSec,
    sessionStartEpochMs: nowMs,
    endEpochMs: nowMs + state.configuredDurationSec * MS_PER_SECOND,
    pausedRemainingSec: null,
    sessionEndEpochMs: null,
    lastTransition: { action: 'start', applicable: true },
  };
}

/**
 * Advance the countdown to the current wall-clock instant (Req 3.3-3.5, 6.3).
 *
 * `tick` only affects a running Session. For a running timer it recomputes
 * `remainingSec = max(0, ceil((endEpochMs - nowMs) / 1000))`, so the displayed
 * value tracks true elapsed time and is robust to interval throttling (Req 3.3,
 * 3.4). When the remaining time reaches 0 the Session ends: the timer
 * transitions to 'completed', `remainingSec` is pinned to 0, and
 * `sessionEndEpochMs` is set to the scheduled completion instant `endEpochMs`
 * (the moment the Timer reached zero), providing the explicit session-ended
 * flag (Req 3.5, 6.3).
 *
 * For any non-running state (idle/paused/completed) the tick is a no-op and the
 * state is returned unchanged. This also upholds reset's post-condition that
 * ticking a reset (idle) timer never changes its remaining time or status.
 */
function tick(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'running' || state.endEpochMs === null) {
    return state;
  }

  const remainingSec = Math.max(
    0,
    Math.ceil((state.endEpochMs - nowMs) / MS_PER_SECOND),
  );

  if (remainingSec === 0) {
    return {
      ...state,
      status: 'completed',
      remainingSec: 0,
      sessionEndEpochMs: state.endEpochMs,
    };
  }

  return {
    ...state,
    remainingSec,
  };
}

/**
 * Pause a running Session, freezing the remaining time (Req 4.1, 4.2, 4.5).
 *
 * Valid only from the 'running' state. On pause the engine computes the current
 * remaining time from the wall clock exactly as `tick` does
 * (`max(0, ceil((endEpochMs - nowMs) / 1000))`), captures it into both
 * `pausedRemainingSec` and `remainingSec`, transitions to 'paused', and clears
 * `endEpochMs` so the countdown stops. Because `tick` is a no-op for any
 * non-running state, the captured remaining time stays unchanged for the entire
 * paused duration (Req 4.4).
 *
 * Pausing while not running is not applicable (Req 4.5): the remaining time and
 * status are left unchanged and a `not_applicable` indication is carried on the
 * transient `lastTransition` field (Property 6).
 */
function pause(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'running' || state.endEpochMs === null) {
    return {
      ...state,
      lastTransition: {
        action: 'pause',
        applicable: false,
        reason: 'not_applicable',
      },
    };
  }

  const capturedRemainingSec = Math.max(
    0,
    Math.ceil((state.endEpochMs - nowMs) / MS_PER_SECOND),
  );

  return {
    ...state,
    status: 'paused',
    remainingSec: capturedRemainingSec,
    pausedRemainingSec: capturedRemainingSec,
    endEpochMs: null,
    lastTransition: { action: 'pause', applicable: true },
  };
}

/**
 * Resume a paused Session, continuing from the captured remaining time
 * (Req 4.3, 4.6).
 *
 * Valid only from the 'paused' state. Resuming continues from exactly the
 * remaining time captured at pause with no loss or addition: it transitions to
 * 'running', recomputes `endEpochMs = nowMs + pausedRemainingSec * 1000`, sets
 * `remainingSec = pausedRemainingSec`, and clears `pausedRemainingSec`.
 *
 * Resuming while not paused is not applicable (Req 4.6): the remaining time and
 * status are left unchanged and a `not_applicable` indication is carried on the
 * transient `lastTransition` field (Property 6).
 */
function resume(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'paused' || state.pausedRemainingSec === null) {
    return {
      ...state,
      lastTransition: {
        action: 'resume',
        applicable: false,
        reason: 'not_applicable',
      },
    };
  }

  const remainingSec = state.pausedRemainingSec;

  return {
    ...state,
    status: 'running',
    remainingSec,
    endEpochMs: nowMs + remainingSec * MS_PER_SECOND,
    pausedRemainingSec: null,
    lastTransition: { action: 'resume', applicable: true },
  };
}

export const timerEngine: TimerEngine = {
  init,
  setDuration,
  start,
  pause,
  resume,
  reset,
  tick,
};

export { init, setDuration, reset, start, tick, pause, resume };
