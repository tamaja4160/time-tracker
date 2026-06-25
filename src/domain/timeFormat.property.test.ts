import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatRemaining, parseRemaining } from './timeFormat';

describe('timeFormat remaining-time display formatting properties', () => {
  // Feature: pomodoro-timer, Property 10: For any non-negative remaining-seconds value, the formatted display has the seconds component in range 00–59 zero-padded to two digits and the minutes component zero-padded to at least two digits, and parsing the formatted string back yields the original whole-second value.
  it('Property 10: formats seconds 00-59, minutes zero-padded to >=2 digits, and round-trips', () => {
    fc.assert(
      fc.property(
        // Non-negative integers: include 0, small values, and large values
        // beyond 999*60 (= 59940) to exercise wide minutes components.
        fc.oneof(
          fc.integer({ min: 0, max: 59 }),
          fc.integer({ min: 0, max: 999 * 60 }),
          fc.integer({ min: 0, max: 100_000_000 }),
        ),
        (n) => {
          const formatted = formatRemaining(n);

          // Structure: minutes ':' seconds
          const parts = formatted.split(':');
          expect(parts).toHaveLength(2);
          const [mm, ss] = parts;

          // Seconds component is in range 00-59, zero-padded to two digits.
          expect(ss).toMatch(/^[0-5]\d$/);

          // Minutes component is zero-padded to at least two digits.
          expect(mm.length).toBeGreaterThanOrEqual(2);
          expect(mm).toMatch(/^\d{2,}$/);

          // Parsing the formatted string back yields the original value.
          expect(parseRemaining(formatted)).toBe(n);
        },
      ),
      { numRuns: 100 },
    );
  });
});
