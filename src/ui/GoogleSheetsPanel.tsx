/**
 * `GoogleSheetsPanel` — Google Sheets connect / create / select panel.
 *
 * Uses the Google Picker API (drive.file scope only — no sensitive scopes)
 * to let users select an existing sheet from their Drive.
 */
import { useEffect, useId, useState } from 'react';
import { validateSheetName } from '../domain/validation';
import { REQUIRED_COLUMNS } from '../domain/sheetsMapping';
import {
  GoogleAuthError,
  type BrowserAuthClient,
} from '../infra/authClient';
import {
  GoogleSheetsError,
  openPicker,
  type BrowserSheetsConnector,
} from '../infra/googleSheets';
import type { TargetSheet } from '../types';

/** Default name offered for a newly created sheet. */
export const DEFAULT_SHEET_NAME = 'FocusLog';

export interface GoogleSheetsPanelProps {
  authClient: BrowserAuthClient;
  sheetsConnector: BrowserSheetsConnector;
  onError?: (msg: string) => void;
}

interface ConnectionState {
  connected: boolean;
  expiresAtMs: number | null;
}

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
  const [isBusy, setIsBusy] = useState(false);

  const [target, setTarget] = useState<TargetSheet | null>(null);
  const [isTargetValid, setIsTargetValid] = useState(false);

  const [newSheetName, setNewSheetName] = useState(DEFAULT_SHEET_NAME);

  const [connectError, setConnectError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [missingColumns, setMissingColumns] = useState<string[] | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const nameFieldId = useId();
  const nameErrorId = useId();

  const nameValidation = validateSheetName(newSheetName);
  const nameError = nameValidation.ok
    ? null
    : nameValidation.reason === 'empty'
      ? 'Enter a sheet name (1–100 characters).'
      : 'Sheet name must be 100 characters or fewer.';

  function emitError(message: string): void {
    onError?.(message);
  }

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
      emitError(message);
    }
  }

  useEffect(() => {
    void refreshStatus();
    try {
      const savedId = authClient.getTargetSheetId();
      if (savedId) {
        setTarget({ spreadsheetId: savedId, sheetTitle: '', hasRequiredColumns: true });
      }
    } catch {
      // surfaced via refreshStatus
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSheetsError(err: unknown, fallback: string): void {
    if (err instanceof GoogleSheetsError) {
      if (err.cause === 'missing_columns') {
        setMissingColumns(err.missing ?? []);
        setSheetError(err.message);
        emitError(err.message);
        return;
      }
      if (err.cause === 'needs_sign_in') {
        const msg = 'Sign in and connect to Google before choosing a sheet.';
        setSheetError(msg);
        emitError(msg);
        return;
      }
      setSheetError(err.message);
      emitError(err.message);
      return;
    }
    const message = err instanceof Error ? err.message : fallback;
    setSheetError(message);
    emitError(message);
  }

  async function handleConnect(): Promise<void> {
    setConnectError(null);
    setIsBusy(true);
    try {
      await authClient.connect();
      await refreshStatus();
      setStatusMessage('Connected to Google.');
    } catch (err) {
      const message = describeConnectError(err);
      setConnectError(message);
      emitError(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    setConnectError(null);
    setIsBusy(true);
    try {
      await authClient.signOut();
      await refreshStatus();
      setStatusMessage('Signed out of Google.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not sign out of Google.';
      setConnectError(message);
      emitError(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateSheet(): Promise<void> {
    setSheetError(null);
    setMissingColumns(null);
    if (!nameValidation.ok) return;
    setIsBusy(true);
    try {
      const created = await sheetsConnector.createSheet(nameValidation.value);
      authClient.setTargetSheetId(created.spreadsheetId);
      setTarget(created);
      setIsTargetValid(true);
      setStatusMessage(`Created and selected "${created.sheetTitle}".`);
    } catch (err) {
      setIsTargetValid(false);
      handleSheetsError(err, 'Could not create the new sheet.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBrowseSheets(): Promise<void> {
    setSheetError(null);
    setMissingColumns(null);

    const accessToken = authClient.getAccessToken();
    if (!accessToken) {
      setSheetError('Connect to Google first, then browse your sheets.');
      return;
    }

    const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ?? '';

    let picked: { id: string; name: string } | null;
    try {
      picked = await openPicker({ accessToken, clientId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open the sheet picker.';
      setSheetError(message);
      emitError(message);
      return;
    }

    if (!picked) return; // user cancelled

    setIsBusy(true);
    try {
      const selected = await sheetsConnector.selectSheet(picked.id);
      authClient.setTargetSheetId(selected.spreadsheetId);
      setTarget(selected);
      setIsTargetValid(true);
      setStatusMessage(`Selected "${selected.sheetTitle}". Ready to write.`);
    } catch (err) {
      setIsTargetValid(false);
      handleSheetsError(err, 'Could not select the sheet.');
    } finally {
      setIsBusy(false);
    }
  }

  const isConnected = connection.connected && !needsReauth;

  return (
    <div className="flex flex-col gap-4">

      {/* Connection status */}
      <p className="text-sm font-medium text-ink">
        Status:{' '}
        <span className={isConnected ? 'text-emerald-600' : 'text-ink-muted'}>
          {isConnected ? 'Connected' : 'Not connected'}
        </span>
      </p>

      {/* Connect / sign-out */}
      <div className="flex flex-wrap gap-2">
        {!connection.connected || needsReauth ? (
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={isBusy}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {needsReauth ? 'Re-authorize Google' : 'Connect Google'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={isBusy}
            className="rounded-full bg-ink/5 px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sign out
          </button>
        )}
      </div>

      {/* Re-auth warning */}
      {connection.connected && needsReauth && (
        <p role="status" aria-live="polite" className="text-sm text-amber-700">
          Your Google authorization has expired. Re-authorize before writing to the spreadsheet.
        </p>
      )}

      {connectError && (
        <p role="alert" className="text-sm text-red-600">{connectError}</p>
      )}

      {/* Sheet selection — only when connected */}
      {isConnected && (
        <div className="flex flex-col gap-4">

          {/* Create new sheet */}
          <div className="flex flex-col gap-2">
            <label htmlFor={nameFieldId} className="text-sm font-medium text-ink">
              Create a new sheet
            </label>
            <div className="flex gap-2">
              <input
                id={nameFieldId}
                type="text"
                value={newSheetName}
                disabled={isBusy}
                aria-invalid={nameError !== null}
                aria-describedby={nameError ? nameErrorId : undefined}
                onChange={(e) => setNewSheetName(e.target.value)}
                className="flex-1 rounded-xl border border-black/10 bg-canvas px-3 py-2 text-sm text-ink focus:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:opacity-50 aria-[invalid=true]:border-red-500"
              />
              <button
                type="button"
                onClick={() => void handleCreateSheet()}
                disabled={isBusy || !nameValidation.ok}
                className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create
              </button>
            </div>
            {nameError && (
              <p id={nameErrorId} role="alert" className="text-sm text-red-600">{nameError}</p>
            )}
          </div>

          {/* Required columns info */}
          <div className="rounded-xl bg-canvas px-4 py-3 text-sm text-ink-muted">
            <p className="font-medium text-ink-soft">
              Existing sheets must have these columns in row 1:
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {REQUIRED_COLUMNS.map((col) => (
                <li key={col} className="rounded-lg bg-white px-2 py-0.5 font-mono text-xs ring-1 ring-black/8">
                  {col}
                </li>
              ))}
            </ul>
          </div>

          {/* Browse existing sheets via Google Picker */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Use an existing sheet</span>
            <button
              type="button"
              onClick={() => void handleBrowseSheets()}
              disabled={isBusy}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Z" stroke="currentColor" strokeWidth="1.25"/>
                <path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
              </svg>
              Browse your sheets
            </button>
            <p className="text-xs text-ink-muted">
              Opens Google's file picker — pick a sheet from your Drive directly.
            </p>
          </div>
        </div>
      )}

      {/* Missing columns detail */}
      {missingColumns && missingColumns.length > 0 && (
        <div role="alert" className="text-sm text-red-600">
          <p>The selected sheet is missing required column(s):</p>
          <ul className="mt-1 list-inside list-disc">
            {missingColumns.map((col) => <li key={col}>{col}</li>)}
          </ul>
        </div>
      )}

      {sheetError && !missingColumns && (
        <p role="alert" className="text-sm text-red-600">{sheetError}</p>
      )}

      {/* Target sheet status */}
      {target?.spreadsheetId && (
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-ink-muted">
            Target sheet:{' '}
            <span className="font-medium text-ink">
              {target.sheetTitle || target.spreadsheetId}
            </span>
          </p>
          {isTargetValid && (
            <p role="status" className="text-sm font-medium text-emerald-700">
              ✓ Sheet is valid and ready for entries.
            </p>
          )}
        </div>
      )}

      {statusMessage && (
        <p role="status" aria-live="polite" className="text-sm text-emerald-700">
          {statusMessage}
        </p>
      )}
    </div>
  );
}
