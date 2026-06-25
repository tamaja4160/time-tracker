/**
 * Clock adapter (infrastructure layer).
 *
 * The pure domain layer never calls `Date.now()` directly; wall-clock time is
 * injected via the `Clock` interface so it can be faked in tests. See design
 * "Layering" and "Infrastructure layer".
 *
 * _Requirements: 1.3, 1.4_
 */
import type { Clock } from '../types';

/**
 * Real clock backed by the system wall-clock via `Date.now()`.
 */
export const systemClock: Clock = {
  now(): number {
    return Date.now();
  },
};

/**
 * Create a real clock instance wrapping `Date.now()`. Provided as a factory in
 * addition to the `systemClock` singleton for symmetry with `createFakeClock`.
 */
export function createSystemClock(): Clock {
  return {
    now(): number {
      return Date.now();
    },
  };
}

/**
 * An in-memory `Clock` whose value is fully controllable, for deterministic
 * tests. `now()` returns the current controlled time; `setNow` and `advance`
 * mutate it.
 */
export interface FakeClock extends Clock {
  /** Set the controlled current time to an absolute epoch-millisecond value. */
  setNow(ms: number): void;
  /** Advance the controlled current time by `deltaMs` milliseconds. */
  advance(deltaMs: number): void;
}

/**
 * Create an in-memory fake clock for tests.
 *
 * @param startMs initial epoch-millisecond value (defaults to 0).
 */
export function createFakeClock(startMs = 0): FakeClock {
  let current = startMs;
  return {
    now(): number {
      return current;
    },
    setNow(ms: number): void {
      current = ms;
    },
    advance(deltaMs: number): void {
      current += deltaMs;
    },
  };
}
