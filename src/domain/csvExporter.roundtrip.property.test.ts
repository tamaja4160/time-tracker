import { test, fc } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { toCsv, parseCsv, deriveId, deriveStartEpochMs } from './csvExporter';
import type { LogEntry } from '../types';

// Feature: pomodoro-timer, Property 13: For any activity log — including descriptions containing commas, double quotes, and line breaks — exporting to CSV and parsing it back produces log entries matching the original field-by-field and preserving record count and order.
// Validates: Requirements 10.3, 10.4

/**
 * The CSV only carries four fields (date, startTime, endTime, description).
 * `parseCsv` reconstructs `id` via {@link deriveId} and `startEpochMs` via
 * {@link deriveStartEpochMs}. To exercise an exact six-field round-trip we
 * build each generated `LogEntry` from generated CSV-carried fields using the
 * same derivation helpers, and use date/time strings `deriveStartEpochMs`
 * can parse (YYYY-MM-DD and HH:MM:SS) so `startEpochMs` is stable.
 */

/** YYYY-MM-DD with valid, round-trip-stable components (day <= 28). */
const date: fc.Arbitrary<string> = fc
  .record({
    year: fc.integer({ min: 1970, max: 9999 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(
    ({ year, month, day }) =>
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );

/** HH:MM:SS 24-hour. */
const time: fc.Arbitrary<string> = fc
  .record({
    h: fc.integer({ min: 0, max: 23 }),
    m: fc.integer({ min: 0, max: 59 }),
    s: fc.integer({ min: 0, max: 59 }),
  })
  .map(
    ({ h, m, s }) =>
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
  );

/**
 * Adversarial descriptions: explicit commas, double quotes, CRLF and bare
 * CR/LF, mixed with arbitrary unicode. Includes the empty string.
 */
const adversarialDescription: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      fc.constant(','),
      fc.constant('"'),
      fc.constant('\r\n'),
      fc.constant('\r'),
      fc.constant('\n'),
      fc.constant('""'),
      fc.constant('a,b'),
      fc.fullUnicodeString({ maxLength: 8 }),
    ),
    { minLength: 0, maxLength: 8 },
  )
  .map((parts) => parts.join(''));

/** A single LogEntry whose id/startEpochMs are derived from its CSV fields. */
const logEntry: fc.Arbitrary<LogEntry> = fc
  .record({
    date,
    startTime: time,
    endTime: time,
    description: adversarialDescription,
  })
  .map(({ date, startTime, endTime, description }) => ({
    id: deriveId(date, startTime, endTime, description),
    date,
    startTime,
    endTime,
    description,
    startEpochMs: deriveStartEpochMs(date, startTime),
  }));

/** An activity log: array of entries, including the empty log. */
const activityLog: fc.Arbitrary<LogEntry[]> = fc.array(logEntry, {
  minLength: 0,
  maxLength: 50,
});

describe('CsvExporter — Property 13: CSV round-trip', () => {
  test.prop([activityLog], { numRuns: 100 })(
    'parseCsv(toCsv(log)) equals log field-by-field, preserving count and order',
    (log) => {
      const roundTripped = parseCsv(toCsv(log));

      // Record count and order preserved (field-by-field deep equality).
      expect(roundTripped).toEqual(log);
      expect(roundTripped).toHaveLength(log.length);

      roundTripped.forEach((entry, i) => {
        expect(entry.id).toBe(log[i].id);
        expect(entry.date).toBe(log[i].date);
        expect(entry.startTime).toBe(log[i].startTime);
        expect(entry.endTime).toBe(log[i].endTime);
        expect(entry.description).toBe(log[i].description);
        expect(entry.startEpochMs).toBe(log[i].startEpochMs);
      });
    },
  );
});
