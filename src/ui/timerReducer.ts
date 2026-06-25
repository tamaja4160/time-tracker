/**
 * Timer reducer (UI layer).
 *
 * A thin reducer that drives `TimerState` purely through the `TimerEngine`
 * actions. The reducer itself makes NO timer decisions: every action delegates
 * to the corresponding pure engine function, with wall-clock time (`nowMs`)
 * injected by the dispatcher (see `useTimer`) from a `Clock`. This keeps the
 * React layer thin and keeps all countdown/transition logic in the tested pure
 * domain core.
 *
 * Used by `TimerScreen` (task 13.1).
 *
 * _Requirements: 1.1, 1.4, 3.3_
 */
import type { TimerState } from '../types/timer';
import { timerEngine } from '../domain/timerEngine';

/**
 * Actions dispatchable to the timer reducer. Each maps one-to-one to a pure
 * `TimerEngine` function. Actions that depend on wall-clock time carry an
 * injected `nowMs` so the reducer stays pure and deterministic.
 */
export type TimerAction =
  | { type: 'setDuration'; minutes: unknown }
  | { type: 'start'; nowMs: number }
  | { type: 'pause'; nowMs: number }
  | { type: 'resume'; nowMs: number }
  | { type: 'reset' }
  | { type: 'tick'; nowMs: number };

/**
 * Reduce a `TimerState` by delegating each action to the pure `TimerEngine`.
 */
export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case 'setDuration':
      return timerEngine.setDuration(state, action.minutes);
    case 'start':
      return timerEngine.start(state, action.nowMs);
    case 'pause':
      return timerEngine.pause(state, action.nowMs);
    case 'resume':
      return timerEngine.resume(state, action.nowMs);
    case 'reset':
      return timerEngine.reset(state);
    case 'tick':
      return timerEngine.tick(state, action.nowMs);
    default:
      // Exhaustiveness guard: if a new action type is added the compiler will
      // flag this branch as a type error.
      return assertNever(action);
  }
}

/** Compile-time exhaustiveness helper for the action union. */
function assertNever(action: never): never {
  throw new Error(`Unhandled timer action: ${JSON.stringify(action)}`);
}
