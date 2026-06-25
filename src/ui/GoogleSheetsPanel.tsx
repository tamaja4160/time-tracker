/**
 * `GoogleSheetsPanel` (UI layer) — task 13.6.
 *
 * Presentational panel for the client-only Google Sheets integration
 * (Option A). It drives connect / sign-out, target-sheet selection (create new
 * or pick existing), and surfaces the write-guard prompts. All Google access
 * goes through the injected {@link BrowserAuthClient} and
 * {@link BrowserSheetsConnector}, so the panel stays testable and the real
 * wiring (task 14.1) supplies concrete instances.
 *
 * Behaviour:
 * - Connect / sign-out controls call `authClient.connect()` / `signOut()` and
 *   show the current connection status. A connect failure surfaces a
 *   cause-specific message and leaves the Retry affordance in place (Req 11.6).
 *   When the cached token is expired/absent (`needsReauth`), a re-authorization
 *   prompt is shown before any write (Req 11.7).
 * - New-sheet flow: a name field defaulting to "Time Tracker" is validated live
 *   as the user types via the pure {@link validateSheetName} (1–100 chars). The
 *   confirm action is blocked until the name is valid (Req 12.1, 12.5). On
 *   confirm it calls `connector.createSheet(name)` and persists the target via
 *   `authClient.setTargetSheetId`.
 * - Select-existing flow: a sheet-id field calls `connector.selectSheet(id)`.
 *   On a `missing_columns` error it lists exactly which columns are missing and
 *   keeps the previously designated target unchanged (Req 12.4).
 * - Write guards: missing auth surfaces a "sign in" prompt (Req 13.2) and a
 *   missing target surfaces a "create or choose a sheet" prompt (Req 13.3).
 *
 * Secrets stay out of this component — it only ever deals with the target sheet
 * id and non-secret status; the access token never leaves the auth layer.
 *
 * _Requirements: 11.6, 11.7, 12.1, 12.4, 12.5, 12.6, 13.2, 13.3_
 */
import { useEffect, useId, useState } from 'react';
import type { TargetSheet } from '../types';
import { validateSheetName } from '../domain/validation';
import { REQUIRED_COLUMNS } from '../domain/sheetsMapping';
import {
  GoogleAuthError,
  type BrowserAuthClient,
} from '../infra/authClient';
import {
  GoogleSheetsError,
  type BrowserSheetsConnector,
  type SpreadsheetSummary,
} from '../infra/googleSheets';

/** Default name offered for a newly created sheet (Req 12.1). */
export const DEFAULT_SHEET_NAME = 'Time Tracker';

export interface GoogleSheetsPanelProps {
  /** Browser auth client (connect / sign-out / status / target sheet id). */
  authClient: BrowserAuthClient;
  /** Browser Sheets connector (create / select / append). */
  sheetsConnector: BrowserSheetsConnector;
  /** Optional sink for surfacing errors to a shared app-level banner. */
  onError?: (msg: string) => void;
}

interface ConnectionState {
  connected: boolean;
  expiresAtMs: number | null;
}

/** Map a connect failure to a cause-specific, user-facing message (Req 11.6). */
function describeConnectError(err: unknown): string {
  if (err instanceof GoogleAuthError) {
    switch (err.cause) {
      case 'access_denied':
        return 'Connection was declined. Grant access to continue, then try again.';
      case 'timeout':
        return 'No response from Google within the time limit. Please try again.';
      case 'popup_closed':
        return 'The Google sign-in window was closed before finishing. Please try again.';
      case 'popup_failed_to_open':
        return 'The browser blocked the Google sign-in window. Allow pop-ups and try again.';
      case 'no_token':
        return 'Google did not return an access token. Please try again.';
      case 'gis_unavailable':
        return 'Google sign-in is unavailable right now. Please try again later.';
      case 'in_progress':
        return 'A sign-in is already in progress.';
      default:
        return 'Could not connect to Google. Please try again.';
    }
  }
  return err instanceof Error
    ? `Could not connect to Google: ${err.message}`
    : 'Could not connect to Google. Please try again.';
}

export function GoogleSheetsPanel({
  authClient,
  sheetsConnector,
  onError,
}: GoogleSheetsPanelProps) {
  const [connection, setConnection] = useState<ConnectionState>({
    connected: false,
    expiresAtMs: null,
  });
  const [needsReauth, setNeedsReauth] = useState(false);
  const [busy, setBusy] = useState(false);

  const [target, setTarget] = useState<TargetSheet | null>(null);
  /** Whether the current target has been validated as having all columns. */
  const [targetValid, setTargetValid] = useState(false);

  const [newSheetName, setNewSheetName] = useState(DEFAULT_SHEET_NAME);
  const [existingSheetId, setExistingSheetId] = useState('');
  /** The user's existing spreadsheets, for the picker dropdown. */
  const [sheets, setSheets] = useState<SpreadsheetSummary[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);

  const [connectError, setConnectError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [missingColumns, setMissingColumns] = useState<string[] | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const nameFieldId = useId();
  const nameErrorId = useId();
  const sheetIdFieldId = useId();

  // Live validation of the new-sheet name as the user types (Req 12.5).
  const nameValidation = validateSheetName(newSheetName);
  const nameError = nameValidation.ok
    ? null
    : nameValidation.reason === 'empty'
      ? 'Enter a sheet name (1–100 characters).'
      : 'Sheet name must be 100 characters or fewer.';

  /** Surface an error both locally and via the optional onError sink. */
  function reportError(message: string): void {
    onError?.(message);
  }

  /** Refresh connection status + re-auth signal from the auth client. */
  async function refreshStatus(): Promise<void> {
    try {
      const status = await authClient.getStatus();
      setConnection(status);
      setNeedsReauth(authClient.needsReauth());
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not read the Google connection status.';
      setConnectError(message);
      reportError(message);
    }
  }

  /** Load the user's existing spreadsheets for the picker (Req: selection UX). */
  async function loadSheets(): Promise<void> {
    setLoadingSheets(true);
    try {
      const found = await sheetsConnector.listSpreadsheets();
      setSheets(found);
    } catch (err) {
      // Non-fatal: the manual id field remains available as a fallback.
      handleSheetsError(err, 'Could not list your spreadsheets.');
    } finally {
      setLoadingSheets(false);
    }
  }

  // Load the persisted connection status and target sheet id on mount (Req 11.3).
  useEffect(() => {
    void (async () => {
      await refreshStatus();
      // If already connected from a previous session, populate the picker.
      const status = await authClient.getStatus().catch(() => null);
      if (status?.connected && !authClient.needsReauth()) {
        void loadSheets();
      }
    })();
    try {
      const savedTargetId = authClient.getTargetSheetId();
      if (savedTargetId) {
        // We only know the id from persisted metadata; reflect it as a target
        // pending re-validation on next select. Title is unknown until selected.
        setTarget({
          spreadsheetId: savedTargetId,
          sheetTitle: '',
          hasRequiredColumns: true,
        });
      }
    } catch {
      // Auth-store read failures are surfaced via refreshStatus paths; ignore here.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect(): Promise<void> {
    setConnectError(null);
    setBusy(true);
    try {
      await authClient.connect();
      await refreshStatus();
      setStatusMessage('Connected to Google.');
      void loadSheets();
    } catch (err) {
      // Cause-specific message; leave the Retry button available (Req 11.6).
      const message = describeConnectError(err);
      setConnectError(message);
      reportError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    setConnectError(null);
    setBusy(true);
    try {
      await authClient.signOut();
      await refreshStatus();
      setStatusMessage('Signed out of Google.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not sign out of Google.';
      setConnectError(message);
      reportError(message);
    } finally {
      setBusy(false);
    }
  }

  /** Shared handler for Sheets errors from create/select. */
  function handleSheetsError(err: unknown, fallback: string): void {
    if (err instanceof GoogleSheetsError) {
      if (err.cause === 'missing_columns') {
        // Keep the previously designated target unchanged (Req 12.4).
        setMissingColumns(err.missing ?? []);
        setSheetError(err.message);
        reportError(err.message);
        return;
      }
      if (err.cause === 'needs_sign_in') {
        // Write/select guard: prompt sign-in (Req 12.6, 13.2).
        setSheetError('Sign in and connect to Google before choosing a sheet.');
        reportError('Sign in and connect to Google before choosing a sheet.');
        return;
      }
      setSheetError(err.message);
      reportError(err.message);
      return;
    }
    const message = err instanceof Error ? err.message : fallback;
    setSheetError(message);
    reportError(message);
  }

  async function handleCreateSheet(): Promise<void> {
    setSheetError(null);
    setMissingColumns(null);
    if (!nameValidation.ok) {
      return; // blocked until the name is valid (Req 12.1, 12.5)
    }
    setBusy(true);
    try {
      const created = await sheetsConnector.createSheet(nameValidation.value);
      authClient.setTargetSheetId(created.spreadsheetId);
      setTarget(created);
      setTargetValid(true);
      setStatusMessage(`Created and selected "${created.sheetTitle}".`);
      void loadSheets(); // include the new sheet in the picker
    } catch (err) {
      setTargetValid(false);
      handleSheetsError(err, 'Could not create the new sheet.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectSheet(idOverride?: string): Promise<void> {
    setSheetError(null);
    setMissingColumns(null);
    const trimmedId = (idOverride ?? existingSheetId).trim();
    if (trimmedId.length === 0) {
      setSheetError('Choose a sheet from the list or enter its id.');
      return;
    }
    setBusy(true);
    try {
      const selected = await sheetsConnector.selectSheet(trimmedId);
      authClient.setTargetSheetId(selected.spreadsheetId);
      setTarget(selected);
      setTargetValid(true);
      setStatusMessage(`Selected "${selected.sheetTitle}". This sheet is valid.`);
    } catch (err) {
      // On missing columns the previous target is retained (Req 12.4).
      setTargetValid(false);
      handleSheetsError(err, 'Could not select the sheet.');
    } finally {
      setBusy(false);
    }
  }

  const connected = connection.connected && !needsReauth;

  return (
    <section
      aria-label="Google Sheets"
      className="flex flex-col gap-4 rounded-4xl border border-black/5 bg-white p-6 shadow-card sm:p-7"
    >
      <div className="flex flex-col">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Google Sheets</h2>
        <p className="text-sm text-ink-muted">
          Write completed sessions straight into a spreadsheet you control.
        </p>
      </div>

      {/* Connection status + controls */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-700">
          Status:{' '}
          <span className="font-medium">
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {!connection.connected || needsReauth ? (
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={busy}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {needsReauth ? 'Re-authorize Google' : 'Connect Google'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={busy}
              className="rounded-full bg-ink/5 px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sign out
            </button>
          )}
        </div>

        {/* Re-auth prompt (Req 11.7) */}
        {connection.connected && needsReauth && (
          <p role="status" aria-live="polite" className="text-sm text-amber-700">
            Your Google authorization has expired. Re-authorize before writing
            to the spreadsheet.
          </p>
        )}

        {/* Connect error with retry affordance left in place (Req 11.6) */}
        {connectError && (
          <p role="alert" className="text-sm text-red-600">
            {connectError}
          </p>
        )}
      </div>

      {/* Write guard: must be signed in (Req 13.2) */}
      {!connection.connected ? (
        <p role="status" aria-live="polite" className="text-sm text-slate-600">
          Sign in and connect to Google before creating or choosing a sheet.
        </p>
      ) : (
        <>
          {/* New-sheet flow (Req 12.1, 12.5) */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor={nameFieldId}
              className="text-sm font-medium text-slate-700"
            >
              Create a new sheet
            </label>
            <input
              id={nameFieldId}
              type="text"
              value={newSheetName}
              disabled={busy}
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? nameErrorId : undefined}
              onChange={(event) => setNewSheetName(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 aria-[invalid=true]:border-red-500"
            />
            {nameError && (
              <p id={nameErrorId} role="alert" className="text-sm text-red-600">
                {nameError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleCreateSheet()}
              disabled={busy || !nameValidation.ok}
              className="self-start rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create sheet
            </button>
          </div>

          {/* Required-columns guidance (Req 12.2-12.4). */}
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            <p className="font-medium text-slate-700">
              An existing sheet must have these exact column headers in row 1:
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {REQUIRED_COLUMNS.map((col) => (
                <li
                  key={col}
                  className="rounded bg-white px-2 py-0.5 font-mono text-xs ring-1 ring-slate-300"
                >
                  {col}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">
              Order doesn't matter and extra columns are fine, but all four
              names must be present (lowercase, e.g. "start time").
            </p>
          </div>

          {/* Select-existing flow: pick from the user's sheets (Req 12.3, 12.4). */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor={sheetIdFieldId}
                className="text-sm font-medium text-slate-700"
              >
                Use an existing sheet
              </label>
              <button
                type="button"
                onClick={() => void loadSheets()}
                disabled={busy || loadingSheets}
                className="text-xs font-medium text-sky-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingSheets ? 'Loading…' : 'Refresh list'}
              </button>
            </div>

            {sheets.length > 0 ? (
              <select
                id={sheetIdFieldId}
                value={existingSheetId}
                disabled={busy}
                onChange={(event) => {
                  const id = event.target.value;
                  setExistingSheetId(id);
                  if (id) void handleSelectSheet(id);
                }}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">— Choose one of your sheets —</option>
                {sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-500">
                {loadingSheets
                  ? 'Loading your spreadsheets…'
                  : 'No spreadsheets found yet. Use "Refresh list", or paste a sheet id below.'}
              </p>
            )}

            {/* Manual id fallback. */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Sheet id"
                placeholder="…or paste a sheet id"
                value={existingSheetId}
                disabled={busy}
                onChange={(event) => setExistingSheetId(event.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
              />
              <button
                type="button"
                onClick={() => void handleSelectSheet()}
                disabled={busy}
                className="rounded-full bg-ink/5 px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Select
              </button>
            </div>
          </div>
        </>
      )}

      {/* Missing-column detail (Req 12.4) */}
      {missingColumns && missingColumns.length > 0 && (
        <div role="alert" className="text-sm text-red-600">
          <p>The selected sheet is missing required column(s):</p>
          <ul className="list-inside list-disc">
            {missingColumns.map((column) => (
              <li key={column}>{column}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Generic sheet error */}
      {sheetError && !missingColumns && (
        <p role="alert" className="text-sm text-red-600">
          {sheetError}
        </p>
      )}

      {/* Target sheet status / missing-target guard (Req 13.3) */}
      {target && target.spreadsheetId ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-slate-700">
            Target sheet:{' '}
            <span className="font-medium">
              {target.sheetTitle || target.spreadsheetId}
            </span>
          </p>
          {targetValid && (
            <p role="status" className="text-sm font-medium text-emerald-700">
              ✓ This sheet has all required columns and is ready for entries.
            </p>
          )}
        </div>
      ) : (
        connection.connected && (
          <p role="status" aria-live="polite" className="text-sm text-slate-600">
            Create or choose a target sheet before writing entries.
          </p>
        )
      )}

      {/* Transient status confirmations */}
      {statusMessage && (
        <p role="status" aria-live="polite" className="text-sm text-emerald-700">
          {statusMessage}
        </p>
      )}
    </section>
  );
}
