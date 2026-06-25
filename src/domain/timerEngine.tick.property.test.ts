import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { init, start, tick } from './timerEngine';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/** clamp(value, lo, hi) */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

describe('TimerEngine tick correctness (wall-clock countdown) properties', () => {
  // Feature: pomodoro-timer, Property 4: For any running session with configured duration D and any elapsed wall-clock time t since start, tick sets remaining time to clamp(D − t, 0, D) within 1 second, remaining time is non-increasing as t increases, and once t ≥ D the timer is completed with remaining time 0 and an end timestamp recorded.
  it('Property 4: tick yields clamp(D - t, 0, D) within 1s, bounded, and completes once t >= D', () => {
    fc.assert(
      fc.property(
        // Valid configured duration D: whole minutes in [1, 999] -> seconds.
        fc.integer({ min: 1, max: 999 }),
        // Arbitrary start epoch (wall-clock instant in ms).
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        // Non-negative elapsed wall-clock time t (ms) since start. Range spans
        // well beyond the maximum duration (999*60s = 59_940_000 ms) so both
        // pre-completion and post-completion (t >= D) cases are exercised.
        fc.integer({ min: 0, max: 70_000_000 }),
        (minutes, nowMs, elapsedMs) => {
          const durationSec = minutes * SECONDS_PER_MINUTE;
          const idle = init(durationSec);
          const running = start(idle, nowMs);

          const ticked = tick(running, nowMs + elapsedMs);

          // remaining is within 1 second of clamp(D - ceil(t/1000), 0, D).
          const elapsedSec = Math.ceil(elapsedMs / MS_PER_SECOND);
          const expected = clamp(durationSec - elapsedSec, 0, durationSec);
          expect(Math.abs(ticked.remainingSec - expected)).toBeLessThanOrEqual(1);

          // remaining stays bounded in [0, D].
          expect(ticked.remainingSec).toBeGreaterThanOrEqual(0);
          expect(ticked.remainingSec).toBeLessThanOrEqual(durationSec);

          // Once elapsed >= D (in ms), the session is completed at zero with an
          // end timestamp recorded.
          if (elapsedMs >= durationSec * MS_PER_SECOND) {
            expect(ticked.status).toBe('completed');
            expect(ticked.remainingSec).toBe(0);
            expect(ticked.sessionEndEpochMs).not.toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: pomodoro-timer, Property 4: For any running session with configured duration D and any elapsed wall-clock time t since start, tick sets remaining time to clamp(D − t, 0, D) within 1 second, remaining time is non-increasing as t increases, and once t ≥ D the timer is completed with remaining time 0 and an end timestamp recorded.
  it('Property 4: remaining time is non-increasing as elapsed time increases', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999 }),
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 0, max: 70_000_000 }),
        fc.integer({ min: 0, max: 70_000_000 }),
        (minutes, nowMs, elapsedA, elapsedB) => {
          const durationSec = minutes * SECONDS_PER_MINUTE;
          const running = start(init(durationSec), nowMs);

          const t1 = Math.min(elapsedA, elapsedB);
          const t2 = Math.max(elapsedA, elapsedB);

          // Tick from the same running start state at each elapsed instant.
          const remaining1 = tick(running, nowMs + t1).remainingSec;
          const remaining2 = tick(running, nowMs + t2).remainingSec;

          // For t2 >= t1, remaining(t2) <= remaining(t1).
          expect(remaining2).toBeLessThanOrEqual(remaining1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
