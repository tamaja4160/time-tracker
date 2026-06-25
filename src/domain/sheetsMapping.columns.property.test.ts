import { test, fc } from '@fast-check/vitest';
import { expect } from 'vitest';
import { validateHeaderColumns, REQUIRED_COLUMNS } from './sheetsMapping';

// Feature: pomodoro-timer, Property 15: For any existing-sheet header row, column validation accepts it iff it contains all four required columns; when one or more are missing it reports exactly the set of missing required columns and rejects the sheet.
// Validates: Requirements 12.4

/**
 * Generators build header rows from:
 *  - a subset of the four required columns (chosen via per-column inclusion
 *    flags so every subset, including empty and full, is reachable), plus
 *  - an arbitrary set of extra (non-required) columns,
 *  - shuffled into an arbitrary order so neither presence nor position of the
 *    required columns is assumed by the validator.
 */
const requiredColumns: string[] = [...REQUIRED_COLUMNS];

// A subset of the required columns, represented by an inclusion flag per column.
const requiredSubset = fc
  .tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean())
  .map((flags) => requiredColumns.filter((_, index) => flags[index]));

// Extra columns that are guaranteed not to collide with the required names.
const extraColumns = fc
  .array(
    fc.string().filter((name) => !requiredColumns.includes(name)),
    { minLength: 0, maxLength: 5 },
  );

// A header row: required subset + extras, in an arbitrary order.
const headerRow = fc
  .tuple(requiredSubset, extraColumns)
  .chain(([subset, extras]) => fc.shuffledSubarray([...subset, ...extras], {
    minLength: subset.length + extras.length,
    maxLength: subset.length + extras.length,
  }));

test.prop([headerRow], { numRuns: 100 })(
  'validateHeaderColumns accepts a header iff all four required columns are present, else reports exactly the missing set',
  (header) => {
    const present = new Set(header);
    const expectedMissing = requiredColumns.filter((column) => !present.has(column));
    const allPresent = expectedMissing.length === 0;

    const result = validateHeaderColumns(header);

    // Acceptance holds iff every required column is present.
    expect(result.ok).toBe(allPresent);

    if (!result.ok) {
      // The reported missing columns must equal exactly the set of required
      // columns not present (order-independent comparison via sets).
      expect(new Set(result.missing)).toEqual(new Set(expectedMissing));
    }
  },
);
