import { test, fc } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { createLogStore } from './logStore';
import { createFakeStorage } from './fakeStorage';
import type { LogEntry } from '../types';

// Feature: pomodoro-timer, Property 12: For any activity log, saving it to the Log_Store and then loading it back yields a log that matches the original field-by-field and preserves record count and order.
// Validates: Requirements 9.1, 9.2, 9.5

/** Arbitrary single LogEntry covering all fields of the record. */
const logEntry: fc.Arbitrary<LogEntry> = fc.record({
  id: fc.string(),
  date: fc.string(),
  startTime: fc.string(),
  endTime: fc.string(),
  description: fc.fullUnicodeString(),
  startEpochMs: fc.integer(),
});

/** Arbitrary activity log: an array of entries, including the empty array. */
const activityLog: fc.Arbitrary<LogEntry[]> = fc.array(logEntry, {
  minLength: 0,
  maxLength: 50,
});

describe('LogStore — Property 12: persistence round-trip', () => {
  test.prop([activityLog], { numRuns: 100 })(
    'saving then loading yields a field-by-field equal log preserving count and order',
    (log) => {
      // Fresh, isolated in-memory storage per run.
      const store = createLogStore(createFakeStorage());

      const saveResult = store.save(log);
      expect(saveResult.ok).toBe(true);

      const loadResult = store.load();
      expect(loadResult.ok).toBe(true);

      if (loadResult.ok) {
        // Field-by-field equality, same record count and order.
        expect(loadResult.value).toEqual(log);
        expect(loadResult.value).toHaveLength(log.length);
        loadResult.value.forEach((entry, i) => {
          expect(entry.id).toBe(log[i].id);
          expect(entry.date).toBe(log[i].date);
          expect(entry.startTime).toBe(log[i].startTime);
          expect(entry.endTime).toBe(log[i].endTime);
          expect(entry.description).toBe(log[i].description);
          expect(entry.startEpochMs).toBe(log[i].startEpochMs);
        });
      }
    },
  );
});
