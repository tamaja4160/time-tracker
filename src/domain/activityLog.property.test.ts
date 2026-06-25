import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createLogEntry } from './activityLog';

/**
 * Local-time-zone formatting helpers mirroring the module's derivation, so the
 * expected values are computed identically regardless of the host time zone
 * (the test is timezone-independent).
 */
function expectedDate(epochMs: number): string {
  const d = new Date(epochMs);
  const year = String(d.getFullYear()).padStart(4, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function expectedTime(epochMs: number): string {
  const d = new Date(epochMs);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

describe('activityLog clock-time field formatting properties', () => {
  // Feature: pomodoro-timer, Property 9: For any session start and end instants, the created log entry's date is the YYYY-MM-DD representation of the start instant and startTime/endTime are the HH:MM:SS 24-hour representations of the start and end instants respectively.
  it('Property 9: date is YYYY-MM-DD of start; startTime/endTime are HH:MM:SS of start/end (local TZ)', () => {
    // Arbitrary epoch ms within +/- a few decades of the Unix epoch, generated
    // from fc.date so values land on valid calendar instants.
    const epochMsArb = fc
      .date({
        min: new Date('1990-01-01T00:00:00.000Z'),
        max: new Date('2050-12-31T23:59:59.000Z'),
      })
      .map((d) => d.getTime());

    fc.assert(
      fc.property(epochMsArb, epochMsArb, (startEpochMs, endEpochMs) => {
        const entry = createLogEntry(
          { startEpochMs, endEpochMs, description: 'test' },
          { idGen: () => 'fixed-id' },
        );

        // date derives from the start instant.
        expect(entry.date).toBe(expectedDate(startEpochMs));
        // startTime derives from the start instant; endTime from the end instant.
        expect(entry.startTime).toBe(expectedTime(startEpochMs));
        expect(entry.endTime).toBe(expectedTime(endEpochMs));

        // Structural format guarantees.
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.startTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        expect(entry.endTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      }),
      { numRuns: 100 },
    );
  });
});
