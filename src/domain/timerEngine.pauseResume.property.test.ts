import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { init, start, tick, pause, resume } from './timerEngine';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

describe('timerEngine pause/resume preserves remaining time properties', () => {
  // Feature: pomodoro-timer, Property 5: For any running session, pausing captures the current remaining time; for any amount of elapsed time while paused, ticking leaves the remaining time unchanged; and resuming continues from exactly the captured remaining time with no time lost or added.
  it('Property 5: pause captures remaining, paused ticks are no-ops, resume continues from captured remaining', () => {
    fc.assert(
      fc.property(
        // Valid duration D (whole minutes in [1, 999]). The dependent
        // generators below constrain t1 to the input space where the session
        // is still running at the moment of pause (t1 < D*1000).
        fc.integer({ min: 1, max: 999 }).chain((minutes) => {
          const durationMs = minutes * SECONDS_PER_MINUTE * MS_PER_SECOND;
          return fc.record({
            minutes: fc.constant(minutes),
            // Arbitrary start epoch.
            nowMs: fc.integer({ min: 0, max: 2_000_000_000_000 }),
            // Elapsed-before-pause so the session is still running.
            t1: fc.integer({ min: 0, max: durationMs - 1 }),
            // Arbitrary amounts of elapsed time while paused (later now values).
            pausedElapsedDeltas: fc.array(
              fc.integer({ min: 0, max: 10_000_000 }),
              { maxLength: 6 },
            ),
            // Wall-clock instant at which resume happens (relative to pause).
            resumeDelta: fc.integer({ min: 0, max: 5_000_000 }),
          });
        }),
        ({ minutes, nowMs, t1, pausedElapsedDeltas, resumeDelta }) => {
          const configuredDurationSec = minutes * SECONDS_PER_MINUTE;
          const durationMs = configuredDurationSec * MS_PER_SECOND;

          // Start a running session anchored at nowMs.
          const idle = init(configuredDurationSec);
          const running = start(idle, nowMs);
          expect(running.status).toBe('running');

          // Pause while still running (t1 < D*1000).
          const pauseAtMs = nowMs + t1;
          const paused = pause(running, pauseAtMs);

          // The engine's ceil computation for the captured remaining time.
          const captured = Math.max(
            0,
            Math.ceil((durationMs - t1) / MS_PER_SECOND),
          );

          // After pause: status 'paused', and pausedRemainingSec === remainingSec
          // === the captured remaining (within the engine's ceil computation).
          expect(paused.status).toBe('paused');
          expect(paused.remainingSec).toBe(captured);
          expect(paused.pausedRemainingSec).toBe(captured);

          // Ticking while paused at arbitrary later now values does not change
          // remainingSec or status.
          let pausedState = paused;
          let cursorMs = pauseAtMs;
          for (const delta of pausedElapsedDeltas) {
            cursorMs += delta;
            pausedState = tick(pausedState, cursorMs);
            expect(pausedState.status).toBe('paused');
            expect(pausedState.remainingSec).toBe(captured);
            expect(pausedState.pausedRemainingSec).toBe(captured);
          }

          // After resume at some nowMs2: status 'running', remainingSec === the
          // captured pausedRemainingSec (no loss/addition), and
          // endEpochMs === nowMs2 + captured*1000.
          const nowMs2 = cursorMs + resumeDelta;
          const resumed = resume(pausedState, nowMs2);
          expect(resumed.status).toBe('running');
          expect(resumed.remainingSec).toBe(captured);
          expect(resumed.endEpochMs).toBe(nowMs2 + captured * MS_PER_SECOND);
        },
      ),
      { numRuns: 100 },
    );
  });
});
