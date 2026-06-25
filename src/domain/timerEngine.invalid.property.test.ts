import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { init, start, tick, pause, resume } from './timerEngine';
import type { TimerState } from '../types/timer';

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

/**
 * Status/remainingSec equivalence, ignoring the transient `lastTransition`
 * field (which is expected to change on an invalid transition).
 */
function expectEquivalent(after: TimerState, before: TimerState): void {
  expect(after.status).toBe(before.status);
  expect(after.remainingSec).toBe(before.remainingSec);
}

describe('TimerEngine invalid-transition no-op properties', () => {
  // Feature: pomodoro-timer, Property 6: For any timer state, an action not applicable to that state (start while running, pause while not running, resume while not paused) returns an equivalent state with remaining time and status unchanged, accompanied by a not-applicable indication.
  it('Property 6: invalid transitions return an equivalent state with a not-applicable indication', () => {
    fc.assert(
      fc.property(
        // Valid configured duration in whole minutes [1, 999].
        fc.integer({ min: 1, max: 999 }),
        // Arbitrary wall-clock start instant.
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        (minutes, nowMs) => {
          const durationSec = minutes * SECONDS_PER_MINUTE;

          // Build a representative state of each status by composing the
          // applicable transitions.
          const idle = init(durationSec);
          const running = start(idle, nowMs);
          const paused = pause(running, nowMs);
          // Drive the running timer to zero so it transitions to completed.
          const completed = tick(running, running.endEpochMs as number);

          expect(idle.status).toBe('idle');
          expect(running.status).toBe('running');
          expect(paused.status).toBe('paused');
          expect(completed.status).toBe('completed');

          const laterMs = nowMs + 5 * MS_PER_SECOND;

          // start while running / paused / completed -> already_running.
          for (const state of [running, paused, completed]) {
            const result = start(state, laterMs);
            expectEquivalent(result, state);
            expect(result.lastTransition).toBeDefined();
            expect(result.lastTransition?.applicable).toBe(false);
            expect(result.lastTransition?.reason).toBe('already_running');
          }

          // pause while idle / paused / completed -> not_applicable.
          for (const state of [idle, paused, completed]) {
            const result = pause(state, laterMs);
            expectEquivalent(result, state);
            expect(result.lastTransition).toBeDefined();
            expect(result.lastTransition?.applicable).toBe(false);
            expect(result.lastTransition?.reason).toBe('not_applicable');
          }

          // resume while idle / running / completed -> not_applicable.
          for (const state of [idle, running, completed]) {
            const result = resume(state, laterMs);
            expectEquivalent(result, state);
            expect(result.lastTransition).toBeDefined();
            expect(result.lastTransition?.applicable).toBe(false);
            expect(result.lastTransition?.reason).toBe('not_applicable');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
