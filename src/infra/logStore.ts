/**
 * LogStore: localStorage adapter for the Activity_Log (task 7.1).
 *
 * Serializes the log to JSON under a single key as a versioned envelope
 * `{ version: 1, entries: LogEntry[] }` (see design "Persistence schema").
 * Domain errors are modeled as values via {@link Result} rather than thrown
 * exceptions, per the design's "Error Handling" section.
 *
 * Requirements:
 * - 9.1/9.2: save the complete log; load returns the parsed entries.
 * - 9.3: missing key loads as an empty log `{ ok: true, value: [] }`.
 * - 9.4: unparseable/corrupt value yields a load-failure WITHOUT overwriting
 *   the raw stored value.
 * - 9.5: a write error yields a save-failure result.
 */
import type { LogEntry, LogStore, Result } from '../types';
import type { StorageLike } from './fakeStorage';

/** localStorage key under which the activity log envelope is stored. */
export const LOG_STORE_KEY = 'timeTracker.activityLog';

/** Current persistence schema version (allows future migration). */
export const LOG_STORE_VERSION = 1 as const;

interface LogEnvelope {
  version: number;
  entries: LogEntry[];
}

function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.date === 'string' &&
    typeof e.startTime === 'string' &&
    typeof e.endTime === 'string' &&
    typeof e.description === 'string' &&
    typeof e.startEpochMs === 'number'
  );
}

function isLogEnvelope(value: unknown): value is LogEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const env = value as Record<string, unknown>;
  if (typeof env.version !== 'number') return false;
  if (!Array.isArray(env.entries)) return false;
  return env.entries.every(isLogEntry);
}

/**
 * Create a {@link LogStore} backed by a `Storage`-like dependency.
 *
 * @param storage A `Storage`-like object. Defaults to `window.localStorage`
 *   when available, allowing an in-memory fake to be injected in tests.
 */
export function createLogStore(storage?: StorageLike): LogStore {
  const backing: StorageLike | undefined =
    storage ??
    (typeof window !== 'undefined' ? window.localStorage : undefined);

  if (!backing) {
    throw new Error(
      'createLogStore: no Storage available; pass a StorageLike dependency.',
    );
  }

  return {
    load(): Result<LogEntry[]> {
      let raw: string | null;
      try {
        raw = backing.getItem(LOG_STORE_KEY);
      } catch (err) {
        // Retrieval itself failed (Req 9.4). Do not touch the stored value.
        return {
          ok: false,
          error: `Failed to read activity log: ${describeError(err)}`,
        };
      }

      // Missing key => empty log (Req 9.3).
      if (raw === null || raw === undefined) {
        return { ok: true, value: [] };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        // Corrupt/unparseable value (Req 9.4): report a load failure and
        // DO NOT overwrite the raw stored value (no write performed here).
        return {
          ok: false,
          error: `Activity log is corrupt and could not be parsed: ${describeError(
            err,
          )}`,
        };
      }

      if (!isLogEnvelope(parsed)) {
        // Structurally invalid value (Req 9.4): treat as a load failure and
        // leave the raw stored value untouched.
        return {
          ok: false,
          error: 'Activity log has an unexpected format and could not be read.',
        };
      }

      return { ok: true, value: parsed.entries };
    },

    save(log: LogEntry[]): Result<void> {
      const envelope: LogEnvelope = {
        version: LOG_STORE_VERSION,
        entries: log,
      };
      try {
        backing.setItem(LOG_STORE_KEY, JSON.stringify(envelope));
        return { ok: true, value: undefined };
      } catch (err) {
        // Write failure, e.g. quota exceeded (Req 9.5).
        return {
          ok: false,
          error: `Failed to save activity log: ${describeError(err)}`,
        };
      }
    },
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
