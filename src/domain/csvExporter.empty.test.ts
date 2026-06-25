import { describe, it, expect } from 'vitest';
import { toCsv, CSV_HEADER } from './csvExporter';

/**
 * Unit test for empty-log CSV export (Task 8.4).
 * Requirements: 10.5 — an empty Activity_Log produces a header-only CSV
 * naming all four columns (date, start time, end time, description): a single
 * header record with no data rows.
 */
describe('csvExporter.toCsv with an empty log', () => {
  it('produces a header-only CSV equal to the four-column header line', () => {
    const csv = toCsv([]);

    // Output is exactly the header line, with no trailing data records.
    expect(csv).toBe('date,start time,end time,description');
  });

  it('contains exactly one record (the header) and no data rows', () => {
    const records = toCsv([]).split('\r\n');

    // A single record: the header row, with no data rows appended.
    expect(records).toHaveLength(1);
    expect(records[0]).toBe('date,start time,end time,description');
  });

  it('names date, start time, end time, and description columns in order', () => {
    const columns = toCsv([]).split('\r\n')[0].split(',');

    expect(columns).toEqual(['date', 'start time', 'end time', 'description']);
    // Header content matches the exported CSV_HEADER definition.
    expect(columns).toEqual([...CSV_HEADER]);
  });
});
