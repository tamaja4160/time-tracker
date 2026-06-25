import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { init, reset } from './timerEngine';

// Feature: pomodoro-timer, Property 2: For any valid configured duration, while no session is running (idle state) the timer's remaining time equals the configured duration.
//
// Validates: Requirements 1.2, 2.3
//
// A "valid configured duration" is a whole number of minutes in [1, 999]
// converted to seconds (minutes * 60). We build the idle state via
// init(configuredDurationSec) and assert it is idle with remainingSec equal to
// the configured duration. We additionally verify that reset() of various
// idle-derived states leaves remaining equal to the configured duration.

const DURATION_MIN_MIN = 1;
const DURATION_MAX_MIN = 999;
const SECONDS_PER_MINUTE = 60;

/** Valid configured durations: whole minutes in [1, 999] -> seconds. */
const configuredDurationSec = (): fc.Arbitrary<number> =>
  fc
    .integer({ min: DURATION_MIN_MIN, max: DURATION_MAX_MIN })
    .map((minutes) => minutes * SECONDS_PER_MINUTE);

describe('Property 2: idle remaining equals configured duration', () => {
  test('init produces an idle state whose remaining time equals the configured duration', () => {
    fc.assert(
      fc.property(configuredDurationSec(), (durationSec) => {
        const state = init(durationSec);

        // No session is running.
        expect(state.status).toBe('idle');
        // Remaining time equals the configured duration.
        expect(state.configuredDurationSec).toBe(durationSec);
        expect(state.remainingSec).toBe(durationSec);
        // A valid duration must not trigger the default fallback.
        expect(state.usingDefaultFallback).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  test('reset of an idle-derived state yields remaining equal to the configured duration', () => {
    fc.assert(
      fc.property(configuredDurationSec(), (durationSec) => {
        // Derive an idle state and apply reset (idempotent for idle states).
        const idle = init(durationSec);
        const afterReset = reset(idle);

        expect(afterReset.status).toBe('idle');
        expect(afterReset.configuredDurationSec).toBe(durationSec);
        expect(afterReset.remainingSec).toBe(durationSec);

        // Resetting again must remain stable.
        const afterSecondReset = reset(afterReset);
        expect(afterSecondReset.status).toBe('idle');
        expect(afterSecondReset.remainingSec).toBe(durationSec);
      }),
      { numRuns: 100 },
    );
  });
});
