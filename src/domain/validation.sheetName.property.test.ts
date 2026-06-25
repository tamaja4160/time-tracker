import { test, fc } from '@fast-check/vitest';
import { expect } from 'vitest';
import { validateSheetName } from './validation';

// Feature: pomodoro-timer, Property 16: For any string, validateSheetName accepts it iff its length after trimming is between 1 and 100 inclusive.
// Validates: Requirements 12.5

/**
 * Generators mix several shapes of input that exercise the trim-then-bound
 * logic of `validateSheetName`:
 *  - arbitrary strings (any unicode content/length)
 *  - whitespace-padded names (leading/trailing whitespace around a core value)
 *  - all-whitespace strings (must reject as empty after trim)
 *  - over-length strings (>100 trimmed chars, must reject as too_long)
 */
const whitespace = fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v', '  ', '\t\n');

const arbitraryString = fc.string();

const whitespacePadded = fc
  .tuple(whitespace, fc.string(), whitespace)
  .map(([lead, core, trail]) => `${lead}${core}${trail}`);

const allWhitespace = fc.array(whitespace, { minLength: 0, maxLength: 20 }).map((parts) => parts.join(''));

const overLength = fc
  .tuple(fc.string({ minLength: 101, maxLength: 300 }), whitespace, whitespace)
  .map(([core, lead, trail]) => `${lead}${core}${trail}`);

const sheetNameInput = fc.oneof(arbitraryString, whitespacePadded, allWhitespace, overLength);

test.prop([sheetNameInput], { numRuns: 100 })(
  'validateSheetName accepts a string iff its trimmed length is in [1, 100]',
  (input) => {
    const trimmed = input.trim();
    const trimmedLength = trimmed.length;
    const result = validateSheetName(input);

    if (trimmedLength >= 1 && trimmedLength <= 100) {
      // Accepted iff trimmed length is within bounds; returns the trimmed value.
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(trimmed);
      }
    } else {
      // Rejected otherwise, with a reason matching which bound was violated.
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(trimmedLength === 0 ? 'empty' : 'too_long');
      }
    }
  },
);
