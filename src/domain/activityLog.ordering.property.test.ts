import { test, fc } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { append, orderedForDisplay } from './activityLog';
import type { LogEntry } from '../types';

// Feature: pomodoro-timer, Property 11: For any activity log and any new entry, appending yields a log containing every prior entry unchanged plus the new entry; and for any activity log, display ordering returns all entries sorted most recent to oldest by start time with no entry added or dropped.
// Validates: Requirements 7.4, 8.1

/** A single LogEntry with all six fields populated. */
const logEntry: fc.Arbitrary<LogEntry> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  date: fc.string({ maxLength: 10 }),
  startTime: fc.string({ maxLength: 8 }),
  endTime: fc.string({ maxLength: 8 }),
  description: fc.string({ maxLength: 50 }),
  startEpochMs: fc.integer({ min: 0, max: 4_102_444_800_000 }),
});

/** An activity log: array of entries, including the empty log. */
const activityLog: fc.Arbitrary<LogEntry[]> = fc.array(logEntry, {
  minLength: 0,
  maxLength: 50,
});

/**
 * Assert `result` is a permutation of `source` by object identity: same length
 * and every element present exactly as many times (by reference) — nothing
 * added or dropped.
 */
function expectSameMultisetByReference(
  result: LogEntry[],
  source: LogEntry[],
): void {
  expect(result).toHaveLength(source.length);
  const remaining = [...source];
  for (const entry of result) {
    const idx = remaining.indexOf(entry);
    expect(idx).toBeGreaterThanOrEqual(0);
    remaining.splice(idx, 1);
  }
  expect(remaining).toHaveLength(0);
}

describe('ActivityLogService — Property 11: append + ordering preserve all entries, newest first', () => {
  test.prop([activityLog, logEntry], { numRuns: 100 })(
    'append yields every prior entry unchanged plus the new entry, without mutating the input',
    (log, entry) => {
      const before = [...log];
      const result = append(log, entry);

      // Result length is exactly one more than the prior log.
      expect(result).toHaveLength(log.length + 1);

      // Prior entries are unchanged and in order.
      expect(result.slice(0, log.length)).toEqual(before);
      result.slice(0, log.length).forEach((e, i) => {
        expect(e).toBe(log[i]);
      });

      // The new entry is the last element (by reference).
      expect(result[result.length - 1]).toBe(entry);

      // Original log array was not mutated.
      expect(log).toEqual(before);
      expect(log).toHaveLength(before.length);
    },
  );

  test.prop([activityLog], { numRuns: 100 })(
    'orderedForDisplay returns all entries sorted most-recent-first with none added or dropped, without mutating the input',
    (log) => {
      const before = [...log];
      const result = orderedForDisplay(log);

      // Permutation: same multiset of entries, nothing added or dropped.
      expectSameMultisetByReference(result, log);

      // Sorted by startEpochMs descending (most recent to oldest).
      for (let i = 0; i + 1 < result.length; i++) {
        expect(result[i].startEpochMs).toBeGreaterThanOrEqual(
          result[i + 1].startEpochMs,
        );
      }

      // Input not mutated.
      expect(log).toEqual(before);
      log.forEach((e, i) => {
        expect(e).toBe(before[i]);
      });
    },
  );
});
