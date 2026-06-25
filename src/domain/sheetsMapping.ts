/**
 * Google Sheets domain mapping (pure).
 *
 * Framework-independent helpers that map between the Activity Log domain and
 * the Google Sheets representation. No DOM, no `Date`, no network.
 *
 * - `validateHeaderColumns` — verify an existing sheet's header row contains all
 *   four required columns; report the exact set of missing columns (Req 12.4).
 * - `toSheetRow` — map a `LogEntry` to the spreadsheet row array in the required
 *   column order, with date/times in 24-hour format (Req 13.1).
 *
 * See design "Google integration interfaces", Property 15 and Property 17.
 */
import type { LogEntry } from '../types';

/**
 * The four required columns of a Target_Sheet, in the canonical left-to-right
 * order used both for sheet creation and for row mapping.
 */
export const REQUIRED_COLUMNS = [
  'date',
  'start time',
  'end time',
  'description',
] as const;

/** Result of validating an existing sheet's header row. */
export type HeaderValidationResult =
  | { ok: true }
  | { ok: false; missing: string[] };

/**
 * Accepts `header` if and only if it contains all four required columns
 * (`date`, `start time`, `end time`, `description`). Extra columns and ordering
 * do not cause rejection as long as every required column is present.
 *
 * On rejection, reports the exact set of missing required columns, preserving
 * their canonical order.
 */
export function validateHeaderColumns(header: string[]): HeaderValidationResult {
  const present = new Set(header);
  const missing = REQUIRED_COLUMNS.filter((column) => !present.has(column));

  if (missing.length === 0) {
    return { ok: true };
  }
  return { ok: false, missing };
}

/**
 * Maps a `LogEntry` to the spreadsheet row `[date, startTime, endTime,
 * description]` in that order. The `LogEntry` already stores `date` as
 * `YYYY-MM-DD` and `startTime`/`endTime` as 24-hour `HH:MM:SS`, so the values
 * are passed through unchanged.
 */
export function toSheetRow(entry: LogEntry): string[] {
  return [entry.date, entry.startTime, entry.endTime, entry.description];
}
