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
export const DEFAULT_SHEET_NAME = 'FocusLog';

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
  const [isBusy, setBusy] = useState(false);

  const [target, setTarget] = useState<TargetSheet | null>(null);

  const [newSheetName, setNewSheetName] = useState(DEFAULT_SHEET_NAME);
  const [existingSheetId, setExistingSheetId] = useState('');
  const [sheets, setSheets] = useState<SpreadsheetSummary[]>([]);
  const [isLoadingSheets, setLoadingSheets] = useState(false);

  const [connectError, setConnectError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [missingColumns, setMissingColumns] = useState<string[] | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const nameFieldId = useId();
  const nameErrorId = useId();

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
      if (connection.connected && !authClient.needsReauth()) {
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
      setStatusMessage(`Created and selected "${created.sheetTitle}".`);
      void loadSheets();
    } catch (err) {
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
      setStatusMessage(`Selected "${selected.sheetTitle}". This sheet is valid.`);
    } catch (err) {
      handleSheetsError(err, 'Could not select the sheet.');
    } finally {
      setBusy(false);
    }
  }

  const connected = connection.connected && !needsReauth;

  return (
    <div className="flex flex-col gap-4">
      {/* Instruction — always visible at the top */}
      <p className="text-sm text-ink-muted">
        Sign in and connect to Google before creating or choosing a sheet.
      </p>

      {/* Status line */}
      <p className="text-sm font-medium">
        Status:{' '}
        {connected ? (
          <span className="text-emerald-600 dark:text-emerald-400">Connected</span>
        ) : (
          <span className="text-red-600 dark:text-red-400">Not connected</span>
        )}
      </p>

      {/* Connect / sign-out controls */}
      <div className="flex flex-wrap items-center gap-2">
        {!connection.connected || needsReauth ? (
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={isBusy}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-canvas transition-colors hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {needsReauth ? 'Re-authorize Google' : 'Connect Google'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={isBusy}
            className="rounded-full bg-ink/5 px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sign out
          </button>
        )}
      </div>

      {/* Re-auth prompt (Req 11.7) */}
      {connection.connected && needsReauth && (
        <p role="status" aria-live="polite" className="text-sm text-amber-700 dark:text-amber-400">
          Your Google authorization has expired. Re-authorize before writing
          to the spreadsheet.
        </p>
      )}

      {/* Connect error (Req 11.6) */}
      {connectError && (
        <p role="alert" className="text-sm text-red-600">
          {connectError}
        </p>
      )}

      {/* Create-new-sheet flow — only when connected (Req 12.1, 12.5) */}
      {connected && (
        <div className="flex flex-col gap-2">
          <label htmlFor={nameFieldId} className="text-sm font-medium text-ink">
            Create a new sheet
          </label>
          <input
            id={nameFieldId}
            type="text"
            value={newSheetName}
            disabled={isBusy}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? nameErrorId : undefined}
            onChange={(event) => setNewSheetName(event.target.value)}
            className="rounded-md border border-black/10 bg-canvas px-2 py-1 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-500"
          />
          {nameError && (
            <p id={nameErrorId} role="alert" className="text-sm text-red-600">
              {nameError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleCreateSheet()}
            disabled={isBusy || !nameValidation.ok}
            className="self-start rounded-full bg-ink px-5 py-2 text-sm font-medium text-canvas transition-colors hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create sheet
          </button>

          {/* Select from existing sheets dropdown */}
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Use an existing sheet</span>
              <button
                type="button"
                onClick={() => void loadSheets()}
                disabled={isBusy || isLoadingSheets}
                className="text-xs font-medium text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingSheets ? 'Loading…' : 'Refresh list'}
              </button>
            </div>
            {sheets.length > 0 ? (
              <select
                value={existingSheetId}
                disabled={isBusy}
                onChange={(event) => {
                  const id = event.target.value;
                  setExistingSheetId(id);
                  if (id) void handleSelectSheet(id);
                }}
                className="rounded-md border border-black/10 bg-canvas px-2 py-1 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">— Choose one of your sheets —</option>
                {sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-ink-muted">
                {isLoadingSheets ? 'Loading your spreadsheets…' : 'No spreadsheets found. Click "Refresh list" to load them.'}
              </p>
            )}
          </div>
        </div>
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

      {/* Transient status confirmations */}
      {statusMessage && (
        <p role="status" aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">
          {statusMessage}
        </p>
      )}
    </div>
  );
}
