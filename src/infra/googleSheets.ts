/**
 * Client-only {@link GoogleSheetsConnector} implementation that talks to the
 * Google Sheets REST API directly from the browser (the **Option A, no-backend**
 * design — see design "Google authorization architecture decision" and
 * "Google integration interfaces").
 *
 * It uses the short-lived OAuth access token obtained by the GIS token flow
 * (task 11.1, {@link createGoogleAuth} in `./googleAuth`) as a
 * `Authorization: Bearer <token>` header. There is **no client secret** in this
 * module — only the access token is ever used (Option A keeps secrets out of
 * the browser).
 *
 * Domain mapping is reused from `../domain/sheetsMapping`:
 * - {@link REQUIRED_COLUMNS} — canonical header order written on sheet creation.
 * - {@link validateHeaderColumns} — column validation on sheet selection (Req 12.4).
 * - {@link toSheetRow} — `LogEntry` → spreadsheet row on append (Req 13.1).
 *
 * ## Responsibilities
 * - `createSheet(name)` — create a new spreadsheet and write the required header
 *   row in canonical order (Req 12.1-12.2).
 * - `selectSheet(sheetId)` — read the first row, validate columns; designate as
 *   the Target_Sheet when all four are present (Req 12.3), otherwise report
 *   exactly which columns are missing and leave any previously designated
 *   target unchanged (Req 12.4 — retention is the caller's concern, honoured
 *   here by throwing without mutating state).
 * - `appendRow(target, entry)` — append a single mapped row (Req 13.1).
 *
 * ## Error handling (design "Google authorization and Sheets")
 * Failures are surfaced as a typed {@link GoogleSheetsError} so the UI can react
 * specifically:
 * - `needs_sign_in` — no valid auth: withhold the write/operation and prompt
 *   sign-in (Req 12.6, 13.2).
 * - `no_target_sheet` — no designated Target_Sheet: prompt to create/choose one
 *   (Req 13.3).
 * - `missing_columns` — selected sheet lacks required columns; carries the exact
 *   `missing` set; the previously designated target is left unchanged (Req 12.4).
 * - `write_failed` — a write to the Target_Sheet did not succeed; the caller
 *   retains the unwritten entry (Req 13.4).
 * - `persistent_failure` — the escalation path exhausted its retries (Req 13.5).
 * - `request_failed` — a non-write REST call (create/select) failed.
 *
 * ## Escalation (Req 13.5)
 * {@link BrowserSheetsConnector.appendRowWithEscalation} retries the append up
 * to 3 attempts at 2-second intervals; if all fail it raises a
 * `persistent_failure`. The delay is injectable so tests need not wait real
 * seconds.
 *
 * All dependencies are injectable: the access-token source, the `fetch`
 * implementation, and the retry sleep/timer.
 *
 * _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 13.1, 13.2, 13.3, 13.4, 13.5_
 */
import type { LogEntry } from '../types/log';
import type { GoogleSheetsConnector, TargetSheet } from '../types/google';
import {
  REQUIRED_COLUMNS,
  toSheetRow,
  validateHeaderColumns,
} from '../domain/sheetsMapping';
import type { CachedToken } from './googleAuth';

/* -------------------------------------------------------------------------- */
/* Error type                                                                  */
/* -------------------------------------------------------------------------- */

/** Cause categories for Sheets operations, so callers can react specifically. */
export type GoogleSheetsErrorCause =
  | 'needs_sign_in' // no valid auth (Req 12.6, 13.2)
  | 'no_target_sheet' // no designated Target_Sheet (Req 13.3)
  | 'missing_columns' // selected sheet lacks required columns (Req 12.4)
  | 'write_failed' // a write did not succeed (Req 13.4)
  | 'persistent_failure' // escalation retries exhausted (Req 13.5)
  | 'request_failed'; // a non-write REST call failed (create/select)

/** Error thrown/rejected from the {@link GoogleSheetsConnector} methods. */
export class GoogleSheetsError extends Error {
  readonly cause: GoogleSheetsErrorCause;
  /** For `missing_columns`: the exact set of missing required columns. */
  readonly missing?: string[];
  /** HTTP status for `request_failed` / `write_failed`, when available. */
  readonly status?: number;

  constructor(
    cause: GoogleSheetsErrorCause,
    message: string,
    extra?: { missing?: string[]; status?: number },
  ) {
    super(message);
    this.name = 'GoogleSheetsError';
    this.cause = cause;
    this.missing = extra?.missing;
    this.status = extra?.status;
  }
}

/* -------------------------------------------------------------------------- */
/* Injectable dependencies                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The subset of the task-11.1 {@link createGoogleAuth} surface this connector
 * needs to obtain a currently-valid access token. {@link GoogleAuth} satisfies
 * this, but any equivalent token source can be injected in tests.
 */
export interface TokenProvider {
  /** The in-memory cached token, or `null` if none. */
  getCachedToken(): CachedToken | null;
  /** Whether the given/cached token is expired. */
  isTokenExpired(token?: CachedToken | null): boolean;
}

/** A `fetch`-compatible function (defaults to the global `fetch`). */
export type FetchLike = typeof fetch;

/** Options for {@link createGoogleSheetsConnector}. */
export interface GoogleSheetsConnectorOptions {
  /**
   * Source of the current OAuth access token (e.g. the task-11.1 GoogleAuth).
   * Injectable so tests can supply a fixed/expired token without the real GIS
   * global.
   */
  tokenProvider: TokenProvider;
  /**
   * `fetch` implementation used for all REST calls. Defaults to the global
   * `fetch`; inject a mock in tests to simulate the Google REST API.
   */
  fetchFn?: FetchLike;
  /**
   * Injectable delay used between escalation retries (Req 13.5). Defaults to a
   * real timer; tests pass a no-op (or a recorder) so they don't wait seconds.
   */
  sleep?: (ms: number) => Promise<void>;
  /** Max append attempts on the escalation path (default 3; Req 13.5). */
  maxAttempts?: number;
  /** Delay between escalation attempts in ms (default 2000; Req 13.5). */
  retryDelayMs?: number;
}

/* -------------------------------------------------------------------------- */
/* Minimal REST request/response shapes                                        */
/* -------------------------------------------------------------------------- */

/** Subset of the Sheets `Spreadsheet` resource this module reads. */
interface SpreadsheetResource {
  spreadsheetId?: string;
  properties?: { title?: string };
  sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
}

/** Subset of the Sheets `ValueRange` resource this module reads. */
interface ValueRange {
  range?: string;
  majorDimension?: string;
  values?: string[][];
}

/** Subset of the Drive `files.list` response this module reads. */
interface DriveFileList {
  files?: Array<{ id?: string; name?: string }>;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Google Drive Files API, used to LIST the user's existing spreadsheets. */
const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';

/** MIME type identifying Google Sheets files in Drive. */
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/** Default escalation policy (Req 13.5). */
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;

/** Real-timer sleep used unless an injected one is provided. */
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* Public surface                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The browser Sheets connector: the backend-agnostic
 * {@link GoogleSheetsConnector} contract plus the Option A escalation helper.
 * Keeping the extra method here mirrors how `authClient` extends `AuthClient`,
 * without leaking Option A specifics into the shared interface.
 */
export interface BrowserSheetsConnector extends GoogleSheetsConnector {
  /**
   * List the user's existing spreadsheets (id + name), most-recently-modified
   * first, so the UI can offer a picker instead of a raw id field. Requires the
   * `drive.metadata.readonly` scope.
   */
  listSpreadsheets(): Promise<SpreadsheetSummary[]>;
  /**
   * Append with the Req 13.5 escalation policy: retry up to `maxAttempts` times
   * at `retryDelayMs` intervals. On exhausting all attempts, throws a
   * `persistent_failure` {@link GoogleSheetsError} for a persistent error
   * notification.
   */
  appendRowWithEscalation(target: TargetSheet, entry: LogEntry): Promise<void>;
}

/** A lightweight summary of a spreadsheet for the selection picker. */
export interface SpreadsheetSummary {
  id: string;
  name: string;
}

/* -------------------------------------------------------------------------- */
/* Implementation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Create a client-only {@link GoogleSheetsConnector} backed by the Google
 * Sheets REST API and an injected access-token source.
 */
export function createGoogleSheetsConnector(
  options: GoogleSheetsConnectorOptions,
): BrowserSheetsConnector {
  const {
    tokenProvider,
    fetchFn = globalThis.fetch?.bind(globalThis),
    sleep = defaultSleep,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  if (typeof fetchFn !== 'function') {
    throw new GoogleSheetsError(
      'request_failed',
      'No fetch implementation is available. Provide one via options.fetchFn.',
    );
  }

  /**
   * Return a currently-valid bearer token, or throw `needs_sign_in` so callers
   * withhold the operation and prompt sign-in (Req 12.6, 13.2).
   */
  function requireAccessToken(): string {
    const token = tokenProvider.getCachedToken();
    if (!token || tokenProvider.isTokenExpired(token)) {
      throw new GoogleSheetsError(
        'needs_sign_in',
        'You need to sign in and connect to Google before continuing.',
      );
    }
    return token.accessToken;
  }

  /**
   * Perform an authorized REST call and parse a JSON response. Network errors
   * and non-2xx responses become {@link GoogleSheetsError} with `failureCause`.
   */
  async function apiRequest<T>(
    url: string,
    init: RequestInit,
    failureCause: 'request_failed' | 'write_failed',
    failureMessage: string,
  ): Promise<T> {
    const accessToken = requireAccessToken();
    let response: Response;
    try {
      response = await fetchFn(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      // Network-level failure (offline, DNS, CORS, aborted, ...).
      throw new GoogleSheetsError(failureCause, `${failureMessage} ${describeError(err)}`.trim());
    }

    if (!response.ok) {
      throw new GoogleSheetsError(failureCause, failureMessage, {
        status: response.status,
      });
    }

    // Some endpoints (e.g. an empty body) may not return JSON; tolerate that.
    try {
      return (await response.json()) as T;
    } catch {
      return undefined as unknown as T;
    }
  }

  /** Read the first sheet's first row (header) for column validation. */
  async function fetchHeaderRow(spreadsheetId: string): Promise<string[]> {
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent('A1:ZZ1')}`;
    const range = await apiRequest<ValueRange>(
      url,
      { method: 'GET' },
      'request_failed',
      'Could not read the selected sheet.',
    );
    return range.values?.[0] ?? [];
  }

  /** Read the spreadsheet's human-facing title. */
  async function fetchSpreadsheetTitle(spreadsheetId: string): Promise<string> {
    const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent('properties.title')}`;
    const resource = await apiRequest<SpreadsheetResource>(
      url,
      { method: 'GET' },
      'request_failed',
      'Could not read the selected sheet.',
    );
    return resource.properties?.title ?? '';
  }

  /** Single append attempt (Req 13.1); throws `write_failed` on any failure. */
  async function appendOnce(
    target: TargetSheet,
    entry: LogEntry,
  ): Promise<void> {
    const range = 'A1'; // unprefixed → first sheet; append finds the table near A1
    const url =
      `${SHEETS_API_BASE}/${encodeURIComponent(target.spreadsheetId)}/values/${encodeURIComponent(range)}:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    await apiRequest<unknown>(
      url,
      { method: 'POST', body: JSON.stringify({ values: [toSheetRow(entry)] }) },
      'write_failed',
      'The write to the target sheet did not succeed.',
    );
  }

  /** Guard: a usable Target_Sheet must be designated (Req 13.3). */
  function requireTarget(target: TargetSheet | null | undefined): TargetSheet {
    if (!target || !target.spreadsheetId || !target.hasRequiredColumns) {
      throw new GoogleSheetsError(
        'no_target_sheet',
        'Create or choose a target sheet before writing.',
      );
    }
    return target;
  }

  return {
    async listSpreadsheets(): Promise<SpreadsheetSummary[]> {
      // Withhold and prompt sign-in if there is no valid auth (Req 12.6).
      requireAccessToken();
      const query = encodeURIComponent(
        `mimeType='${SPREADSHEET_MIME}' and trashed=false`,
      );
      const url =
        `${DRIVE_FILES_API}?q=${query}` +
        `&fields=${encodeURIComponent('files(id,name)')}` +
        `&orderBy=${encodeURIComponent('modifiedTime desc')}` +
        `&pageSize=100`;
      const list = await apiRequest<DriveFileList>(
        url,
        { method: 'GET' },
        'request_failed',
        'Could not list your spreadsheets.',
      );
      return (list.files ?? [])
        .filter((f): f is { id: string; name: string } =>
          typeof f.id === 'string' && f.id.length > 0,
        )
        .map((f) => ({ id: f.id, name: f.name ?? '(untitled)' }));
    },

    async createSheet(name: string): Promise<TargetSheet> {
      // Withhold and prompt sign-in if there is no valid auth (Req 12.6).
      requireAccessToken();

      // 1) Create the spreadsheet with the given name (Req 12.1-12.2).
      const created = await apiRequest<SpreadsheetResource>(
        SHEETS_API_BASE,
        { method: 'POST', body: JSON.stringify({ properties: { title: name } }) },
        'request_failed',
        'Could not create the new sheet.',
      );

      const spreadsheetId = created.spreadsheetId;
      if (!spreadsheetId) {
        throw new GoogleSheetsError(
          'request_failed',
          'Could not create the new sheet: no spreadsheet id was returned.',
        );
      }

      // 2) Write the required header row in canonical order (Req 12.2). Use an
      //    unprefixed A1 range so it targets the freshly created first sheet.
      const headerUrl =
        `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent('A1')}` +
        `?valueInputOption=RAW`;
      await apiRequest<unknown>(
        headerUrl,
        {
          method: 'PUT',
          body: JSON.stringify({ values: [[...REQUIRED_COLUMNS]] }),
        },
        'request_failed',
        'Could not write the header row to the new sheet.',
      );

      return {
        spreadsheetId,
        sheetTitle: created.properties?.title ?? name,
        hasRequiredColumns: true,
      };
    },

    async selectSheet(sheetId: string): Promise<TargetSheet> {
      // Withhold and prompt sign-in if there is no valid auth (Req 12.6).
      requireAccessToken();

      const [header, title] = await Promise.all([
        fetchHeaderRow(sheetId),
        fetchSpreadsheetTitle(sheetId),
      ]);

      const validation = validateHeaderColumns(header);
      if (!validation.ok) {
        // Report exactly which columns are missing; do not mutate any state, so
        // the caller's previously designated Target_Sheet stays unchanged (Req 12.4).
        throw new GoogleSheetsError(
          'missing_columns',
          `The selected sheet is missing required column(s): ${validation.missing.join(', ')}.`,
          { missing: validation.missing },
        );
      }

      return {
        spreadsheetId: sheetId,
        sheetTitle: title,
        hasRequiredColumns: true,
      };
    },

    async appendRow(target: TargetSheet, entry: LogEntry): Promise<void> {
      // Write guards (Req 13.2 / 13.3) before any network call.
      requireAccessToken();
      const validTarget = requireTarget(target);
      // Single attempt: a failure surfaces `write_failed` so the caller can
      // retain the unwritten entry (Req 13.4).
      await appendOnce(validTarget, entry);
    },

    async appendRowWithEscalation(
      target: TargetSheet,
      entry: LogEntry,
    ): Promise<void> {
      requireAccessToken();
      const validTarget = requireTarget(target);

      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await appendOnce(validTarget, entry);
          return; // success — stop retrying
        } catch (err) {
          lastError = err;
          // Re-auth / target guards aren't retryable; surface immediately.
          if (
            err instanceof GoogleSheetsError &&
            (err.cause === 'needs_sign_in' || err.cause === 'no_target_sheet')
          ) {
            throw err;
          }
          if (attempt < maxAttempts) {
            await sleep(retryDelayMs); // wait 2 s between attempts (Req 13.5)
          }
        }
      }

      // All attempts failed — escalate with a persistent error (Req 13.5).
      throw new GoogleSheetsError(
        'persistent_failure',
        `The write to the target sheet failed after ${maxAttempts} attempts. ${describeError(lastError)}`.trim(),
      );
    },
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err === undefined || err === null) return '';
  return String(err);
}
