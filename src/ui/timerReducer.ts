/**
 * Timer reducer (UI layer).
 *
 * A thin reducer that drives `TimerState` purely through `TimerEngine` actions.
 * All countdown/transition decisions live in the domain engine; this file only
 * routes dispatched actions to the corresponding engine function and injects
 * wall-clock time (`nowMs`) from the caller's `Clock`.
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
      return assertNever(action);
  }
}

/** Compile-time exhaustiveness helper for the action union. */
function assertNever(action: never): never {
  throw new Error(`Unhandled timer action: ${JSON.stringify(action)}`);
}
