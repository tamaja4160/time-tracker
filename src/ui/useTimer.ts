/**
 * `useTimer` hook (UI layer).
 *
 * Wires the pure `timerReducer`/`TimerEngine` to React state and runs the
 * countdown tick interval. The hook keeps the component thin: it owns only the
 * reducer state, a clock-aware dispatch wrapper, and the `setInterval` lifecycle.
 *
 * Tick interval: while a session is running, a 250 ms `setInterval` dispatches a
 * `tick` action carrying the current clock time (Req 1.4, 3.3). Ticking at
 * 250 ms is frequent enough to keep the displayed seconds within 1 second of
 * true elapsed wall-clock time while staying responsive. The interval is
 * cleared on unmount and whenever the timer is not running.
 *
 * The `Clock` is injectable for deterministic tests; it defaults to the real
 * `systemClock`.
 *
 * _Requirements: 1.1, 1.4, 3.3_
 */
import { useCallback, useEffect, useReducer } from 'react';
import type { Clock } from '../types/clock';
import type { TimerState } from '../types/timer';
import { systemClock } from '../infra/clock';
import { timerEngine, DEFAULT_DURATION_SEC } from '../domain/timerEngine';
import { timerReducer } from './timerReducer';

/** How often the running countdown is recomputed from the wall clock. */
export const TICK_INTERVAL_MS = 250;

/** Actions the timer view can trigger; all decisions delegate to the engine. */
export interface TimerControls {
  setDuration(minutes: unknown): void;
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
}

export interface UseTimerResult {
  state: TimerState;
  controls: TimerControls;
}

/**
 * Drive a `TimerState` via the pure engine and run the tick interval.
 *
 * @param clock injectable time provider (defaults to {@link systemClock}).
 * @param initialDurationSec initial configured duration in seconds (defaults to
 *   the Default_Duration of 15 minutes).
 */
export function useTimer(
  clock: Clock = systemClock,
  initialDurationSec: number = DEFAULT_DURATION_SEC,
): UseTimerResult {
  const [state, dispatch] = useReducer(
    timerReducer,
    initialDurationSec,
    (sec) => timerEngine.init(sec),
  );

  const setDuration = useCallback(
    (minutes: unknown) => dispatch({ type: 'setDuration', minutes }),
    [],
  );
  const start = useCallback(
    () => dispatch({ type: 'start', nowMs: clock.now() }),
    [clock],
  );
  const pause = useCallback(
    () => dispatch({ type: 'pause', nowMs: clock.now() }),
    [clock],
  );
  const resume = useCallback(
    () => dispatch({ type: 'resume', nowMs: clock.now() }),
    [clock],
  );
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  // Run the countdown tick only while a session is running. The effect
  // re-subscribes when the running status changes and always clears its
  // interval on cleanup (status change or unmount), so no stale interval runs
  // while idle/paused/completed.
  const isRunning = state.status === 'running';
  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const id = setInterval(() => {
      dispatch({ type: 'tick', nowMs: clock.now() });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRunning, clock]);

  return { state, controls: { setDuration, start, pause, resume, reset } };
}
