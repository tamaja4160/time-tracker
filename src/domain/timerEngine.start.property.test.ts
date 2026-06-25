import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { init, start } from './timerEngine';

describe('TimerEngine start transition properties', () => {
  // Feature: pomodoro-timer, Property 3: For any idle timer with a valid configured duration, starting a session transitions to the running state with remaining time equal to the configured duration.
  it('Property 3: starting an idle timer transitions to running with remaining equal to configured duration', () => {
    fc.assert(
      fc.property(
        // Valid configured durations: whole minutes in [1, 999] -> seconds.
        fc.integer({ min: 1, max: 999 }).map((minutes) => minutes * 60),
        // Arbitrary wall-clock instant at which the session is started.
        fc.integer({ min: 0, max: 8_640_000_000_000_000 }),
        (configuredDurationSec, nowMs) => {
          const idle = init(configuredDurationSec);
          // Precondition: init yields a valid idle timer for valid durations.
          expect(idle.status).toBe('idle');
          expect(idle.configuredDurationSec).toBe(configuredDurationSec);

          const started = start(idle, nowMs);

          // Transitions to the running state.
          expect(started.status).toBe('running');
          // Remaining time equals the configured duration.
          expect(started.remainingSec).toBe(configuredDurationSec);
          expect(started.configuredDurationSec).toBe(configuredDurationSec);
          // Session is anchored to the provided wall-clock instant.
          expect(started.sessionStartEpochMs).toBe(nowMs);
          expect(started.endEpochMs).toBe(nowMs + configuredDurationSec * 1000);
        },
      ),
      { numRuns: 100 },
    );
  });
});
