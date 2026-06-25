import { test, fc } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { validateDescription } from './validation';

// Feature: pomodoro-timer, Property 8: For any string, validateDescription accepts it iff its length after trimming is between 1 and 50 inclusive; rejected strings report empty when trimmed value is empty and too_long when trimmed length exceeds 50; accepted strings yield the trimmed value.
// Validates: Requirements 6.4, 6.5, 6.6

const WHITESPACE_CHARS = [' ', '\t', '\n', '\r', '\f', '\v', '\u00a0'];

/** Arbitrary whitespace-only string (may be empty). */
const whitespace = fc
  .array(fc.constantFrom(...WHITESPACE_CHARS), { maxLength: 8 })
  .map((chars) => chars.join(''));

/**
 * Generator covering the relevant input space:
 * - arbitrary unicode strings (full range, including surrogate pairs)
 * - whitespace-padded strings (leading/trailing whitespace around content)
 * - all-whitespace strings (trim to empty -> rejected as `empty`)
 * - over-length strings (>50 after trimming -> rejected as `too_long`)
 */
const descriptionInput: fc.Arbitrary<string> = fc.oneof(
  // Arbitrary unicode of any length.
  fc.fullUnicodeString(),
  // Whitespace-padded around arbitrary (often non-whitespace) content.
  fc
    .tuple(whitespace, fc.fullUnicodeString(), whitespace)
    .map(([lead, core, trail]) => `${lead}${core}${trail}`),
  // All-whitespace strings.
  whitespace,
  // Over-length strings: non-whitespace content guaranteed to exceed 50 after trim.
  fc
    .tuple(
      whitespace,
      fc.string({ minLength: 51, maxLength: 200 }).map((s) => s.replace(/\s/g, 'x')),
      whitespace,
    )
    .map(([lead, core, trail]) => `${lead}${core}${trail}`),
);

describe('validateDescription — Property 8', () => {
  test.prop([descriptionInput], { numRuns: 100 })(
    'accepts iff trimmed length in [1, 50], with correct reasons and trimmed value',
    (input) => {
      const trimmed = input.trim();
      const result = validateDescription(input);

      if (trimmed.length >= 1 && trimmed.length <= 50) {
        // Accepted: yields the trimmed value.
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(trimmed);
        }
      } else {
        // Rejected: reason is empty when trimmed is empty, too_long otherwise.
        expect(result.ok).toBe(false);
        if (!result.ok) {
          if (trimmed.length === 0) {
            expect(result.reason).toBe('empty');
          } else {
            expect(trimmed.length).toBeGreaterThan(50);
            expect(result.reason).toBe('too_long');
          }
        }
      }
    },
  );
});
