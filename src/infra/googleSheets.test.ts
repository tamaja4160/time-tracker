/**
 * Integration tests for the client-only Sheets connector (task 12.3).
 *
 * These example-based tests exercise {@link createGoogleSheetsConnector}
 * end-to-end against a *mocked* `fetch` (no real Google REST API) and a fake
 * {@link TokenProvider}. They assert the connector issues the right REST calls
 * (URLs, methods, bodies), maps domain values via `../domain/sheetsMapping`,
 * and surfaces the typed {@link GoogleSheetsError} causes the UI depends on.
 *
 * Coverage map:
 * - 12.2  createSheet POSTs a spreadsheet create then writes REQUIRED_COLUMNS
 *         (canonical order) as the header row; returns hasRequiredColumns true.
 * - 12.3  selectSheet accepts an existing sheet whose header contains all four
 *         required columns (any order / with extras).
 * - 12.4  selectSheet on a header missing required columns throws
 *         'missing_columns' carrying the exact `.missing` set.
 * - 13.1  appendRow POSTs values.append with the mapped row
 *         [date, startTime, endTime, description].
 * - 13.2  no valid auth -> writes/operations throw 'needs_sign_in' and do NOT
 *         touch fetch.
 * - 13.3  no usable Target_Sheet -> appendRow throws 'no_target_sheet'.
 * - 13.4/13.5  a single failed append throws 'write_failed'; the escalation
 *         path retries up to maxAttempts then throws 'persistent_failure'.
 *
 * _Requirements: 12.2, 12.3, 13.1, 13.2, 13.3, 13.4, 13.5_
 */
import { describe, test, expect, vi } from 'vitest';
import {
  createGoogleSheetsConnector,
  GoogleSheetsError,
  type FetchLike,
  type TokenProvider,
} from './googleSheets';
import { REQUIRED_COLUMNS } from '../domain/sheetsMapping';
import type { CachedToken } from './googleAuth';
import type { LogEntry, TargetSheet } from '../types';

/* -------------------------------------------------------------------------- */
/* Fakes / helpers                                                             */
/* -------------------------------------------------------------------------- */

const ACCESS_TOKEN = 'tok-valid-123';

/** A token provider that always offers a valid, unexpired token. */
function validTokenProvider(): TokenProvider {
  const token: CachedToken = {
    accessToken: ACCESS_TOKEN,
    expiresAtMs: Number.MAX_SAFE_INTEGER,
  };
  return {
    getCachedToken: () => token,
    isTokenExpired: () => false,
  };
}

/** A token provider with no token (signed out). */
function signedOutTokenProvider(): TokenProvider {
  return {
    getCachedToken: () => null,
    isTokenExpired: () => true,
  };
}

/** A token provider whose (present) token is expired. */
function expiredTokenProvider(): TokenProvider {
  const token: CachedToken = { accessToken: 'old', expiresAtMs: 1 };
  return {
    getCachedToken: () => token,
    isTokenExpired: () => true,
  };
}

/** Build a minimal Response-like object the connector understands. */
function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const SAMPLE_ENTRY: LogEntry = {
  id: 'entry-1',
  date: '2024-03-15',
  startTime: '09:00:00',
  endTime: '09:25:00',
  description: 'Write integration tests',
  startEpochMs: 1_710_492_000_000,
};

const READY_TARGET: TargetSheet = {
  spreadsheetId: 'sheet-abc',
  sheetTitle: 'Time Tracker',
  hasRequiredColumns: true,
};

/* -------------------------------------------------------------------------- */
/* 12.2 createSheet writes the canonical header row                            */
/* -------------------------------------------------------------------------- */

describe('createSheet (Req 12.2)', () => {
  test('creates a spreadsheet then writes REQUIRED_COLUMNS as the header row in order', async () => {
    const fetchFn = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST') {
          // The spreadsheets.create call.
          return Promise.resolve(
            jsonResponse({
              spreadsheetId: 'new-sheet-id',
              properties: { title: 'My Log' },
            }),
          );
        }
        // The header PUT.
        return Promise.resolve(jsonResponse({}));
      },
    );

    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    const target = await connector.createSheet('My Log');

    // Two REST calls: create (POST) then header write (PUT).
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const [createUrl, createInit] = fetchFn.mock.calls[0];
    expect(String(createUrl)).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets',
    );
    expect((createInit?.method ?? '').toUpperCase()).toBe('POST');
    expect(JSON.parse(createInit?.body as string)).toEqual({
      properties: { title: 'My Log' },
    });
    // Bearer auth is attached.
    expect((createInit?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );

    const [headerUrl, headerInit] = fetchFn.mock.calls[1];
    expect(String(headerUrl)).toContain('/new-sheet-id/values/');
    expect((headerInit?.method ?? '').toUpperCase()).toBe('PUT');
    expect(JSON.parse(headerInit?.body as string)).toEqual({
      values: [[...REQUIRED_COLUMNS]],
    });
    // The header is written in canonical left-to-right order.
    expect(JSON.parse(headerInit?.body as string).values[0]).toEqual([
      'date',
      'start time',
      'end time',
      'description',
    ]);

    expect(target).toEqual({
      spreadsheetId: 'new-sheet-id',
      sheetTitle: 'My Log',
      hasRequiredColumns: true,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* 12.3 selectSheet accepts an existing valid sheet                            */
/* -------------------------------------------------------------------------- */

describe('selectSheet — accept existing sheet (Req 12.3)', () => {
  test('accepts a header containing all required columns in any order with extras', async () => {
    // Header GET returns the four required columns out of order, plus extras.
    const header = ['notes', 'description', 'date', 'extra', 'end time', 'start time'];

    const fetchFn = vi.fn((url: string) => {
      if (String(url).includes('/values/')) {
        return Promise.resolve(jsonResponse({ values: [header] }));
      }
      // Title GET.
      return Promise.resolve(
        jsonResponse({ properties: { title: 'Existing Log' } }),
      );
    });

    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    const target = await connector.selectSheet('existing-id');

    expect(target).toEqual({
      spreadsheetId: 'existing-id',
      sheetTitle: 'Existing Log',
      hasRequiredColumns: true,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* 12.4 selectSheet rejects a sheet missing required columns                   */
/* -------------------------------------------------------------------------- */

describe('selectSheet — missing-column rejection (Req 12.4)', () => {
  test('throws GoogleSheetsError cause "missing_columns" listing exactly the missing columns', async () => {
    // Present: date, description. Missing: start time, end time.
    const header = ['date', 'description', 'something else'];

    const fetchFn = vi.fn((url: string) => {
      if (String(url).includes('/values/')) {
        return Promise.resolve(jsonResponse({ values: [header] }));
      }
      return Promise.resolve(
        jsonResponse({ properties: { title: 'Incomplete' } }),
      );
    });

    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    const error = await connector.selectSheet('incomplete-id').catch((e) => e);

    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect(error.cause).toBe('missing_columns');
    expect(error.missing).toEqual(['start time', 'end time']);
  });
});

/* -------------------------------------------------------------------------- */
/* 13.2 Guard writes without auth                                              */
/* -------------------------------------------------------------------------- */

describe('write guards — no valid auth (Req 13.2)', () => {
  test('appendRow throws "needs_sign_in" and never calls fetch when signed out', async () => {
    const fetchFn = vi.fn();
    const connector = createGoogleSheetsConnector({
      tokenProvider: signedOutTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    const error = await connector
      .appendRow(READY_TARGET, SAMPLE_ENTRY)
      .catch((e) => e);

    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect(error.cause).toBe('needs_sign_in');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('createSheet throws "needs_sign_in" and never calls fetch when the token is expired', async () => {
    const fetchFn = vi.fn();
    const connector = createGoogleSheetsConnector({
      tokenProvider: expiredTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    const error = await connector.createSheet('Anything').catch((e) => e);

    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect(error.cause).toBe('needs_sign_in');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* 13.3 Guard writes without a designated Target_Sheet                         */
/* -------------------------------------------------------------------------- */

describe('write guards — no target sheet (Req 13.3)', () => {
  test('appendRow throws "no_target_sheet" when target is null', async () => {
    const fetchFn = vi.fn();
    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    const error = await connector
      .appendRow(null as unknown as TargetSheet, SAMPLE_ENTRY)
      .catch((e) => e);

    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect(error.cause).toBe('no_target_sheet');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('appendRow throws "no_target_sheet" when target lacks required columns', async () => {
    const fetchFn = vi.fn();
    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    const unusableTarget: TargetSheet = {
      spreadsheetId: 'sheet-x',
      sheetTitle: 'Bad',
      hasRequiredColumns: false,
    };

    const error = await connector
      .appendRow(unusableTarget, SAMPLE_ENTRY)
      .catch((e) => e);

    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect(error.cause).toBe('no_target_sheet');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* 13.1 appendRow posts the mapped row                                         */
/* -------------------------------------------------------------------------- */

describe('appendRow (Req 13.1)', () => {
  test('POSTs values.append with the mapped row [date, startTime, endTime, description]', async () => {
    const fetchFn = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({})),
    );
    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    await connector.appendRow(READY_TARGET, SAMPLE_ENTRY);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('/sheet-abc/values/');
    expect(String(url)).toContain(':append');
    expect((init?.method ?? '').toUpperCase()).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      values: [['2024-03-15', '09:00:00', '09:25:00', 'Write integration tests']],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* 13.4 / 13.5 Write failure and escalation                                    */
/* -------------------------------------------------------------------------- */

describe('write failure and escalation (Req 13.4, 13.5)', () => {
  test('a single failed append throws cause "write_failed"', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(jsonResponse({}, { ok: false, status: 500 })),
    );
    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
    });

    const error = await connector
      .appendRow(READY_TARGET, SAMPLE_ENTRY)
      .catch((e) => e);

    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect(error.cause).toBe('write_failed');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test('appendRowWithEscalation retries up to maxAttempts then throws "persistent_failure"', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(jsonResponse({}, { ok: false, status: 503 })),
    );
    const sleep = vi.fn(() => Promise.resolve());
    const maxAttempts = 3;

    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
      sleep,
      maxAttempts,
      retryDelayMs: 2000,
    });

    const error = await connector
      .appendRowWithEscalation(READY_TARGET, SAMPLE_ENTRY)
      .catch((e) => e);

    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect(error.cause).toBe('persistent_failure');
    // One fetch per attempt, and a sleep between (but not after) each attempt.
    expect(fetchFn).toHaveBeenCalledTimes(maxAttempts);
    expect(sleep).toHaveBeenCalledTimes(maxAttempts - 1);
  });

  test('appendRowWithEscalation succeeds without retrying when the first attempt works', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(jsonResponse({})));
    const sleep = vi.fn(() => Promise.resolve());

    const connector = createGoogleSheetsConnector({
      tokenProvider: validTokenProvider(),
      fetchFn: fetchFn as unknown as FetchLike,
      sleep,
      maxAttempts: 3,
    });

    await connector.appendRowWithEscalation(READY_TARGET, SAMPLE_ENTRY);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* GoogleSheetsError shape                                                     */
/* -------------------------------------------------------------------------- */

describe('GoogleSheetsError', () => {
  test('is an Error subclass carrying a typed cause and optional missing set', () => {
    const err = new GoogleSheetsError('missing_columns', 'oops', {
      missing: ['end time'],
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GoogleSheetsError');
    expect(err.cause).toBe('missing_columns');
    expect(err.missing).toEqual(['end time']);
  });
});
