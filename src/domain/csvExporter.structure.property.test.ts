import { test, fc } from '@fast-check/vitest';
import { expect } from 'vitest';
import type { LogEntry } from '../types';
import { toCsv, parseCsv, CSV_HEADER, deriveId, deriveStartEpochMs } from './csvExporter';

// Feature: pomodoro-timer, Property 14: For any activity log, the produced CSV has the four-column header row (date, start time, end time, description) as its first record, contains exactly one data record per log entry, and renders dates as YYYY-MM-DD and times as HH:MM:SS.
// Validates: Requirements 10.1, 10.2

/**
 * Generators build LogEntry arrays whose `date` is a valid YYYY-MM-DD and
 * whose `startTime`/`endTime` are valid HH:MM:SS values, so that the
 * formatting assertions (dates render as YYYY-MM-DD, times as HH:MM:SS) are
 * meaningful. Descriptions are arbitrary unicode — including commas, double
 * quotes, and CR/LF — to ensure the data-record count is verified through a
 * proper RFC 4180 parse rather than a naive CRLF split.
 */
const pad = (value: number, width: number): string =>
  value.toString().padStart(width, '0');

const dateString = fc
  .tuple(
    fc.integer({ min: 0, max: 9999 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }), // 1..28 is valid in every month
  )
  .map(([y, mo, d]) => `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}`);

const timeString = fc
  .tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
  )
  .map(([h, mi, s]) => `${pad(h, 2)}:${pad(mi, 2)}:${pad(s, 2)}`);

const logEntry: fc.Arbitrary<LogEntry> = fc
  .tuple(dateString, timeString, timeString, fc.string({ maxLength: 60 }))
  .map(([date, startTime, endTime, description]) => ({
    id: deriveId(date, startTime, endTime, description),
    date,
    startTime,
    endTime,
    description,
    startEpochMs: deriveStartEpochMs(date, startTime),
  }));

const activityLog = fc.array(logEntry, { minLength: 0, maxLength: 25 });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;

test.prop([activityLog], { numRuns: 100 })(
  'CSV has the four-column header as its first record, one data record per entry, and YYYY-MM-DD / HH:MM:SS fields',
  (log) => {
    const csv = toCsv(log);

    // First record is the four-column header. The header row contains no
    // special characters, so it is reliably terminated by the first CRLF and
    // can be read without a full parse.
    const firstRecord = csv.split('\r\n')[0];
    expect(firstRecord.split(',')).toEqual([
      'date',
      'start time',
      'end time',
      'description',
    ]);
    expect(firstRecord.split(',')).toEqual([...CSV_HEADER]);

    // Exactly one data record per log entry. parseCsv performs an RFC 4180
    // parse that correctly handles quoted fields containing CRLF, so the count
    // is accurate even for adversarial descriptions.
    const dataRecords = parseCsv(csv);
    expect(dataRecords).toHaveLength(log.length);

    // Dates render as YYYY-MM-DD and times as HH:MM:SS for every data record.
    dataRecords.forEach((entry, index) => {
      expect(entry.date).toMatch(DATE_RE);
      expect(entry.startTime).toMatch(TIME_RE);
      expect(entry.endTime).toMatch(TIME_RE);
      // The rendered fields correspond to the original entry positionally.
      expect(entry.date).toBe(log[index].date);
      expect(entry.startTime).toBe(log[index].startTime);
      expect(entry.endTime).toBe(log[index].endTime);
    });
  },
);
