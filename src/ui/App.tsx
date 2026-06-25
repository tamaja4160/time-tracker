/**
 * `App` — application bootstrap and end-to-end wiring (task 14.1).
 *
 * Composes the already-built pieces into the running Time Tracker:
 * - Lifts the timer state to the app level via {@link useTimer} so the timer,
 *   the activity prompt, and the activity log all share one session
 *   (Req 1.1). The timer is rendered as the primary content via
 *   {@link TimerScreen}.
 * - On mount, loads the persisted Activity_Log from the {@link LogStore}
 *   (Req 9.2); on a retrieval failure it shows an error and presents an empty
 *   log without discarding the stored data (Req 9.4). It also loads the Google
 *   connection status from the {@link AuthClient} (Req 11.3).
 * - On session completion it shows the {@link ActivityPrompt}. On a valid
 *   description it builds a `LogEntry` from the session instants, appends it via
 *   the activity-log service, persists it via the `LogStore` (Req 9.1), and
 *   updates the displayed log (Req 7.4, 8.3). On an append/persist failure it
 *   retains the entered description so the user can retry (Req 7.5).
 * - Renders {@link ActivityLogView}, {@link ExportBar}, and
 *   {@link GoogleSheetsPanel}, plus a shared {@link ErrorBanner} region for
 *   transient and persistent error messages (Req 13.5).
 *
 * Google integration uses the client-only Option A adapters. The OAuth client
 * id is read from `import.meta.env.VITE_GOOGLE_CLIENT_ID` with a safe
 * empty-string fallback; the user supplies it (e.g. in a `.env` file) to enable
 * Google Sheets. No network access happens at load — only on explicit connect.
 *
 * _Requirements: 1.1, 7.4, 7.5, 8.3, 9.1, 9.2, 11.3_
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clock } from '../types/clock';
import type { LogEntry, LogStore } from '../types';
import { systemClock } from '../infra/clock';
import { createLogStore } from '../infra/logStore';
import {
  createAuthClient,
  AuthStoreError,
  type BrowserAuthClient,
} from '../infra/authClient';
import { createGoogleAuth } from '../infra/googleAuth';
import {
  createGoogleSheetsConnector,
  GoogleSheetsError,
  type BrowserSheetsConnector,
} from '../infra/googleSheets';
import { activityLogService, createLogEntry } from '../domain/activityLog';
import { useTimer } from './useTimer';
import { TimerScreen } from './TimerScreen';
import { ActivityPrompt } from './ActivityPrompt';
import { ActivityLogView } from './ActivityLogView';
import { ExportBar } from './ExportBar';
import { GoogleSheetsPanel } from './GoogleSheetsPanel';
import { ErrorBanner, type AppError } from './ErrorBanner';

export interface AppProps {
  /** Injectable clock for deterministic tests (defaults to {@link systemClock}). */
  clock?: Clock;
  /** Injectable {@link LogStore} (defaults to a localStorage-backed store). */
  logStore?: LogStore;
  /** Injectable auth client (defaults to the Option A browser auth client). */
  authClient?: BrowserAuthClient;
  /** Injectable Sheets connector (defaults to the Option A REST connector). */
  sheetsConnector?: BrowserSheetsConnector;
}

/** A `fetch` that always rejects, used only when no global `fetch` exists. */
const unavailableFetch = (() =>
  Promise.reject(new Error('fetch is unavailable in this environment'))) as unknown as typeof fetch;

export function App({
  clock = systemClock,
  logStore: logStoreProp,
  authClient: authClientProp,
  sheetsConnector: sheetsConnectorProp,
}: AppProps = {}) {
  // --- Infrastructure instances (stable across renders) ---------------------
  const logStore = useMemo<LogStore>(
    () => logStoreProp ?? createLogStore(),
    [logStoreProp],
  );

  const googleAuth = useMemo(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
    return createGoogleAuth({ clientId });
  }, []);

  const authClient = useMemo<BrowserAuthClient>(
    () => authClientProp ?? createAuthClient({ googleAuth }),
    [authClientProp, googleAuth],
  );

  const sheetsConnector = useMemo<BrowserSheetsConnector>(
    () =>
      sheetsConnectorProp ??
      createGoogleSheetsConnector({
        tokenProvider: googleAuth,
        fetchFn:
          typeof globalThis.fetch === 'function'
            ? globalThis.fetch.bind(globalThis)
            : unavailableFetch,
      }),
    [sheetsConnectorProp, googleAuth],
  );

  // --- Timer state (lifted so prompt + log share the same session) ----------
  const timer = useTimer(clock);
  const { state, controls } = timer;

  // --- Activity log + error state -------------------------------------------
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [activitySubmitError, setActivitySubmitError] = useState<string | null>(
    null,
  );
  /** Transient positive notice when an entry is written to Google Sheets. */
  const [writeNotice, setWriteNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<AppError[]>([]);
  const errorSeq = useRef(0);

  /** Push an app-level error onto the shared banner (newest first). */
  const pushError = useCallback((message: string) => {
    errorSeq.current += 1;
    const id = `err-${errorSeq.current}`;
    setErrors((prev) => [{ id, message }, ...prev]);
  }, []);

  const dismissError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // --- Bootstrap: load persisted log + auth status on mount ------------------
  useEffect(() => {
    // Load the Activity_Log (Req 9.2). On a retrieval failure, show an error and
    // present an empty log WITHOUT discarding the stored data (Req 9.4).
    const result = logStore.load();
    if (result.ok) {
      setEntries(result.value);
    } else {
      setEntries([]);
      pushError(result.error);
    }

    // Load the Google connection status (Req 11.3). A failure to read the
    // browser Auth_Store is surfaced but never touches the Activity_Log (11.8).
    void authClient.getStatus().catch((err: unknown) => {
      if (err instanceof AuthStoreError) {
        pushError(err.message);
      } else if (err instanceof Error) {
        pushError(err.message);
      }
    });
    // Instances are stable (useMemo); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Activity completion flow ---------------------------------------------
  const promptOpen = state.status === 'completed';

  const handleActivitySubmit = useCallback(
    (description: string) => {
      const { sessionStartEpochMs, sessionEndEpochMs } = state;
      if (sessionStartEpochMs == null || sessionEndEpochMs == null) {
        // Defensive: a completed session should always carry both instants.
        setActivitySubmitError(
          'Could not record the session times. Please try again.',
        );
        return;
      }

      let entry: LogEntry;
      try {
        entry = createLogEntry({
          startEpochMs: sessionStartEpochMs,
          endEpochMs: sessionEndEpochMs,
          description,
        });
      } catch {
        // Retain the description so the user can retry (Req 7.5).
        setActivitySubmitError(
          'Could not create the log entry. Please try again.',
        );
        return;
      }

      // Append (pure, append-only) then persist (Req 7.4, 9.1).
      const nextLog = activityLogService.append(entries, entry);
      const saveResult = logStore.save(nextLog);
      if (!saveResult.ok) {
        // Persist failure: keep the prompt open with the entered text retained
        // so the user can retry (Req 7.5), and surface the save error (Req 9.5).
        setActivitySubmitError('Could not save the entry. Please try again.');
        pushError(saveResult.error);
        return;
      }

      // Success: update the displayed log (Req 8.3), clear the prompt error,
      // then immediately begin the next session of the same duration so the
      // Pomodoro loop continues hands-free (reset → start).
      setEntries(nextLog);
      setActivitySubmitError(null);
      controls.reset();
      controls.start();

      // Also write the entry to the chosen Google Sheet, if one is configured
      // (Req 13.1). The local entry is already saved, so a write failure keeps
      // it locally and only surfaces an error (Req 13.2-13.4).
      const targetId = authClient.getTargetSheetId();
      if (targetId) {
        setWriteNotice(null);
        void (async () => {
          try {
            await sheetsConnector.appendRow(
              {
                spreadsheetId: targetId,
                sheetTitle: '',
                hasRequiredColumns: true,
              },
              entry,
            );
            setWriteNotice('Latest entry written to your Google Sheet.');
          } catch (err) {
            const message =
              err instanceof GoogleSheetsError && err.cause === 'needs_sign_in'
                ? 'Connect to Google to write entries to your sheet — the entry was kept locally.'
                : 'Could not write the entry to your Google Sheet. It was kept locally; you can retry.';
            pushError(message);
          }
        })();
      }
    },
    [state, entries, logStore, controls, pushError, authClient, sheetsConnector],
  );

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">Time Tracker</h1>
        </div>
      </header>

      {/* Shared transient/persistent error region (Req 13.5). */}
      <div className="mx-auto max-w-3xl">
        <ErrorBanner errors={errors} onDismiss={dismissError} />

        {writeNotice && (
          <div className="px-6 pt-4">
            <p
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700"
            >
              {writeNotice}
            </p>
          </div>
        )}
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {/* Primary content: the timer (Req 1.1), sharing the lifted state. */}
        <TimerScreen clock={clock} timer={timer} />

        {/* Activity log (most-recent-first, live updates on append). */}
        <ActivityLogView entries={entries} />

        {/* CSV export. */}
        <ExportBar entries={entries} />

        {/* Client-only Google Sheets integration. */}
        <GoogleSheetsPanel
          authClient={authClient}
          sheetsConnector={sheetsConnector}
          onError={pushError}
        />
      </main>

      {/* Completion prompt; retains entered text on append/persist failure. */}
      <ActivityPrompt
        open={promptOpen}
        onSubmit={handleActivitySubmit}
        submitError={activitySubmitError}
      />
    </div>
  );
}
