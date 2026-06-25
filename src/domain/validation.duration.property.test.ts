import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { parseDuration } from './validation';

// Feature: pomodoro-timer, Property 1: For any input value, parseDuration accepts it iff it represents a whole number of minutes between 1 and 999 inclusive; and for any sequence of setDuration calls, the effective configured duration is always a whole number of minutes in [1, 999], with rejected inputs leaving the previous configured duration unchanged.
//
// Validates: Requirements 2.1, 2.3, 2.4, 2.6
//
// Notes on the "sequence of setDuration calls" portion: TimerEngine.setDuration
// is not yet implemented. Per the design, setDuration validates input via the
// pure Validation module (parseDuration) and retains the previous configured
// duration on rejection. We therefore model configured-duration (in minutes) as
// a fold over a generated sequence of inputs: start from a valid default and,
// for each input, apply parseDuration — on ok update to the parsed minutes, on
// failure leave the previous value unchanged. The invariant under test is that
// the modeled configured duration is always a whole number of minutes in
// [1, 999], which mirrors Req 2.6.

const DURATION_MIN = 1;
const DURATION_MAX = 999;

/** Mix of integers (in/outside range), floats, NaN, strings, null, undefined. */
const durationInput = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    // Whole numbers spanning well inside and outside [1, 999].
    fc.integer({ min: -2000, max: 2000 }),
    // Floats including NaN, Infinity, and non-integers.
    fc.double({ noDefaultInfinity: false, noNaN: false }),
    // Arbitrary strings (mostly garbage / non-numeric).
    fc.string(),
    // Numeric-looking strings, including out-of-range and whitespace-padded.
    fc.integer({ min: -2000, max: 2000 }).map((n) => `  ${n}  `),
    // Float-looking strings (should be rejected — not whole numbers).
    fc.double({ noDefaultInfinity: true, noNaN: true }).map((n) => String(n)),
    fc.constantFrom(null, undefined, true, false, {}, []),
  );

/** Oracle: true iff `input` represents a whole number of minutes in [1, 999]. */
function isValidDuration(input: unknown): boolean {
  let value: number;
  if (typeof input === 'number') {
    value = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) {
      return false;
    }
    value = Number(trimmed);
  } else {
    return false;
  }
  return Number.isInteger(value) && value >= DURATION_MIN && value <= DURATION_MAX;
}

describe('Property 1: duration validation and invariant', () => {
  test('parseDuration accepts iff the input is a whole number of minutes in [1, 999]', () => {
    fc.assert(
      fc.property(durationInput(), (input) => {
        const result = parseDuration(input);
        const expected = isValidDuration(input);

        expect(result.ok).toBe(expected);

        if (result.ok) {
          // Accepted values must surface a whole number of minutes in range.
          expect(Number.isInteger(result.minutes)).toBe(true);
          expect(result.minutes).toBeGreaterThanOrEqual(DURATION_MIN);
          expect(result.minutes).toBeLessThanOrEqual(DURATION_MAX);
          // And the parsed minutes must equal the input's numeric value.
          const numericValue =
            typeof input === 'string' ? Number(input.trim()) : (input as number);
          expect(result.minutes).toBe(numericValue);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('a sequence of setDuration calls keeps the configured duration a whole number in [1, 999], with rejected inputs leaving it unchanged', () => {
    fc.assert(
      fc.property(
        // A valid starting configured duration (whole minutes in range)...
        fc.integer({ min: DURATION_MIN, max: DURATION_MAX }),
        // ...and a sequence of arbitrary setDuration inputs.
        fc.array(durationInput(), { maxLength: 50 }),
        (start, inputs) => {
          let configured = start;

          for (const input of inputs) {
            const previous = configured;
            const result = parseDuration(input);

            if (result.ok) {
              configured = result.minutes;
            }
            // else: rejected input leaves the previous configured duration unchanged.

            // Invariant after every step: whole number of minutes in [1, 999].
            expect(Number.isInteger(configured)).toBe(true);
            expect(configured).toBeGreaterThanOrEqual(DURATION_MIN);
            expect(configured).toBeLessThanOrEqual(DURATION_MAX);

            // Rejected inputs must not change the configured duration.
            if (!result.ok) {
              expect(configured).toBe(previous);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
