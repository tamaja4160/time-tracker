/**
 * ActivityLogService domain module (pure) — Log_Entry construction.
 *
 * Framework-independent helpers that build a {@link LogEntry} from a completed
 * session's start/end instants (epoch milliseconds) plus an already-validated,
 * trimmed Activity_Description. No DOM and no network. The only ambient
 * dependency is an id generator, which is injectable for deterministic tests
 * and defaults to `crypto.randomUUID()` when available.
 *
 * Time/format conventions (see design "Time and format conventions"):
 * - `date`: `YYYY-MM-DD` of the start instant in the user's local time zone.
 * - `startTime` / `endTime`: 24-hour `HH:MM:SS` of the start and end instants
 *   respectively, in the user's local time zone, each component zero-padded.
 *
 * This module also provides the append-only `append` and the most-recent-first
 * `orderedForDisplay` operations, exposed together with construction through the
 * {@link activityLogService} object implementing the `ActivityLogService`
 * interface.
 *
 * _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1_
 */
import type { ActivityLogService, LogEntry } from '../types';

/** Parameters describing a completed session to build a log entry from. */
export interface CreateLogEntryParams {
  /** Epoch milliseconds at which the session began (the start instant). */
  startEpochMs: number;
  /** Epoch milliseconds at which the timer reached zero (the end instant). */
  endEpochMs: number;
  /** Already-validated, trimmed Activity_Description (1..50 chars). */
  description: string;
}

/** Injectable dependencies for {@link createLogEntry}. */
export interface CreateLogEntryDeps {
  /** Stable unique id generator. Defaults to {@link defaultIdGen}. */
  idGen?: () => string;
}

/**
 * Default id generator. Uses `crypto.randomUUID()` when available, throwing a
 * descriptive error otherwise so callers in environments without it must
 * inject their own generator.
 */
export function defaultIdGen(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  throw new Error(
    'crypto.randomUUID is unavailable; inject a custom idGen via deps.idGen',
  );
}

/**
 * Build a {@link LogEntry} from a completed session's start/end instants and a
 * validated description.
 *
 * The `date`, `startTime`, and `endTime` fields are derived from the instants
 * in the user's local time zone. The provided `description` is assumed to be
 * already validated and trimmed (validation lives in the UI / `validateDescription`),
 * so it is stored as given. `startEpochMs` is preserved for deterministic
 * most-recent-first ordering downstream.
 *
 * @param params session start/end instants and the validated description.
 * @param deps optional injectable dependencies (id generator).
 * @returns a fully populated `LogEntry`.
 */
export function createLogEntry(
  params: CreateLogEntryParams,
  deps: CreateLogEntryDeps = {},
): LogEntry {
  const { startEpochMs, endEpochMs, description } = params;

  if (!Number.isFinite(startEpochMs)) {
    throw new RangeError(`createLogEntry expects a finite startEpochMs, received: ${startEpochMs}`);
  }
  if (!Number.isFinite(endEpochMs)) {
    throw new RangeError(`createLogEntry expects a finite endEpochMs, received: ${endEpochMs}`);
  }

  const idGen = deps.idGen ?? defaultIdGen;
  const start = new Date(startEpochMs);

  return {
    id: idGen(),
    date: formatLocalDate(start),
    startTime: formatLocalTime(start),
    endTime: formatLocalTime(new Date(endEpochMs)),
    description,
    startEpochMs,
  };
}

/**
 * Format a `Date` as `YYYY-MM-DD` using its local-time-zone calendar fields,
 * zero-padding the month and day to two digits and the year to at least four.
 */
function formatLocalDate(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a `Date` as 24-hour `HH:MM:SS` using its local-time-zone clock fields,
 * each component zero-padded to two digits (e.g. `09:00:00`).
 */
function formatLocalTime(d: Date): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Append a Log_Entry to an Activity_Log (pure, append-only).
 *
 * Returns a brand-new array containing every prior entry unchanged followed by
 * the new entry. The input `log` is never mutated and no existing entry is
 * dropped or altered (the append-only invariant, Req 7.4). Ordering for display
 * is a separate concern handled by {@link orderedForDisplay}; this function
 * preserves insertion order with the new entry last.
 *
 * @param log the current Activity_Log.
 * @param entry the newly created Log_Entry to append.
 * @returns a new array with `entry` appended after all prior entries.
 *
 * _Requirements: 7.4_
 */
export function append(log: LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log, entry];
}

/**
 * Return the Activity_Log ordered most-recent-first by `startEpochMs`
 * (descending), without adding or dropping any entry.
 *
 * Produces a sorted copy; the input `log` is never mutated. Every entry present
 * in the input appears exactly once in the output (Req 8.1). Sorting is stable
 * with respect to entries sharing the same `startEpochMs`.
 *
 * @param log the Activity_Log to order for display.
 * @returns a new array sorted from most recent to oldest by start time.
 *
 * _Requirements: 8.1_
 */
export function orderedForDisplay(log: LogEntry[]): LogEntry[] {
  return [...log].sort((a, b) => b.startEpochMs - a.startEpochMs);
}

/**
 * ActivityLogService implementation: append-only mutation and most-recent-first
 * display ordering. Construction lives in {@link createLogEntry}.
 */
export const activityLogService: ActivityLogService = {
  append,
  orderedForDisplay,
};
