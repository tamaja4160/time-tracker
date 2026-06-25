import { test, fc } from '@fast-check/vitest';
import { expect } from 'vitest';
import { toSheetRow } from './sheetsMapping';
import type { LogEntry } from '../types';

// Feature: pomodoro-timer, Property 17: For any log entry, the spreadsheet row produced for it is the array [date, startTime, endTime, description] in that order, with date and times in 24-hour format.
// Validates: Requirements 13.1

/** Date in YYYY-MM-DD. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Time in 24-hour HH:MM:SS. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

const pad2 = (n: number) => n.toString().padStart(2, '0');

// A calendar date as YYYY-MM-DD (constrained to always-valid day ranges).
const dateArb = fc
  .tuple(
    fc.integer({ min: 0, max: 9999 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y.toString().padStart(4, '0')}-${pad2(m)}-${pad2(d)}`);

// A 24-hour HH:MM:SS time string.
const timeArb = fc
  .tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
  )
  .map(([h, m, s]) => `${pad2(h)}:${pad2(m)}:${pad2(s)}`);

// A LogEntry with well-formed date/time fields and an arbitrary description.
const logEntryArb: fc.Arbitrary<LogEntry> = fc.record({
  id: fc.string(),
  date: dateArb,
  startTime: timeArb,
  endTime: timeArb,
  description: fc.string(),
  startEpochMs: fc.integer({ min: 0 }),
});

test.prop([logEntryArb], { numRuns: 100 })(
  'toSheetRow produces [date, startTime, endTime, description] in order with 24-hour date/time fields',
  (entry) => {
    const row = toSheetRow(entry);

    // Exact array, in the required column order.
    expect(row).toEqual([
      entry.date,
      entry.startTime,
      entry.endTime,
      entry.description,
    ]);

    // Date and time fields are in the expected 24-hour formats.
    expect(row[0]).toMatch(DATE_RE);
    expect(row[1]).toMatch(TIME_RE);
    expect(row[2]).toMatch(TIME_RE);
  },
);
