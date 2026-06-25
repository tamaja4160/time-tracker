import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { init, start, tick, reset } from './timerEngine';
import type { TimerState } from '../types/timer';

/**
 * The not-running state a reset returns to.
 */
const NOT_RUNNING_STATUS = 'idle';

/**
 * Arbitrary for a valid configured duration in seconds: a whole number of
 * minutes in [1, 999] expressed in seconds (so `init` accepts it without
 * falling back to the Default_Duration).
 */
const configuredDurationSecArb = fc
  .integer({ min: 1, max: 999 })
  .map((minutes) => minutes * 60);

/**
 * Build a varied timer state by composing engine operations starting from a
 * valid configured duration: `init`, then optionally `start(nowMs)` and
 * `tick(nowMs + elapsedMs)`. With arbitrary `nowMs` and `elapsedMs` this
 * reaches idle, running, and completed states.
 */
const timerStateArb: fc.Arbitrary<TimerState> = fc
  .record({
    configuredDurationSec: configuredDurationSecArb,
    doStart: fc.boolean(),
    doTick: fc.boolean(),
    nowMs: fc.integer({ min: 0, max: 4_000_000_000_000 }),
    // Elapsed can be before, during, or well past the configured duration so
    // ticks land on both running and completed outcomes.
    elapsedMs: fc.integer({ min: 0, max: 2 * 999 * 60 * 1000 }),
  })
  .map(({ configuredDurationSec, doStart, doTick, nowMs, elapsedMs }) => {
    let state = init(configuredDurationSec);
    if (doStart) {
      state = start(state, nowMs);
      if (doTick) {
        state = tick(state, nowMs + elapsedMs);
      }
    }
    return state;
  });

describe('timerEngine reset transition properties', () => {
  // Feature: pomodoro-timer, Property 7: For any timer state, resetting transitions to the not-running state with remaining time equal to the configured duration, produces no log entry, and subsequent ticks do not change remaining time or status until a new session is started.
  it('Property 7: reset returns to not-running at full duration, logs nothing, and idle ticks are no-ops', () => {
    fc.assert(
      fc.property(
        timerStateArb,
        // Arbitrary later "now" values for subsequent ticks after reset.
        fc.array(fc.integer({ min: 0, max: 8_000_000_000_000 }), {
          minLength: 1,
          maxLength: 5,
        }),
        (state, laterNowValues) => {
          const resetState = reset(state);

          // Transitions to the not-running (idle) state. (Req 5.3)
          expect(resetState.status).toBe(NOT_RUNNING_STATUS);

          // Remaining time equals the configured duration. (Req 5.1)
          expect(resetState.remainingSec).toBe(
            resetState.configuredDurationSec,
          );
          expect(resetState.configuredDurationSec).toBe(
            state.configuredDurationSec,
          );

          // All session bookkeeping is cleared so no session lingers. (Req 5.2)
          expect(resetState.endEpochMs).toBeNull();
          expect(resetState.pausedRemainingSec).toBeNull();
          expect(resetState.sessionStartEpochMs).toBeNull();
          expect(resetState.sessionEndEpochMs).toBeNull();

          // Produces no log entry: `reset` returns only a TimerState (no entry
          // is created by construction — its signature yields TimerState
          // alone), so there is nothing logged on reset. (Req 5.2)
          expect(reset).toHaveLength(1); // reset(state) — no log output param

          // Subsequent ticks do not change remaining time or status until a
          // new session is started: idle ticks are no-ops. (Req 5.3)
          let ticked = resetState;
          for (const laterNow of laterNowValues) {
            ticked = tick(ticked, laterNow);
            expect(ticked.status).toBe(NOT_RUNNING_STATUS);
            expect(ticked.remainingSec).toBe(resetState.remainingSec);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
