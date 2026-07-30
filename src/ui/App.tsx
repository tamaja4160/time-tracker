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
import { SettingsPanel } from './SettingsPanel';
import type { Clock } from '../types/clock';
import type { LogEntry, LogStore } from '../types';
import { systemClock } from '../infra/clock';
import { createLogStore } from '../infra/logStore';
import {
  createAuthClient,
  type BrowserAuthClient,
} from '../infra/authClient';
import { createGoogleAuth } from '../infra/googleAuth';
import {
  createGoogleSheetsConnector,
  GoogleSheetsError,
  type BrowserSheetsConnector,
} from '../infra/googleSheets';
import { activityLogService, createLogEntry } from '../domain/activityLog';
import { formatRemaining } from '../domain/timeFormat';
import { createBrowserNotifier, type Notifier, type NotificationPermissionState } from '../infra/notifications';
import { createSoundPlayer, type SoundPlayer } from '../infra/sound';
import { useTimer } from './useTimer';
import { TimerScreen } from './TimerScreen';
import { ActivityPrompt } from './ActivityPrompt';
import { ActivityLogView } from './ActivityLogView';
import { ExportBar } from './ExportBar';
import { GoogleSheetsPanel } from './GoogleSheetsPanel';
import { CollapsibleSection } from './CollapsibleSection';
import { ErrorBanner, type AppError } from './ErrorBanner';

export interface AppProps {
  /** Injectable clock for deterministic tests (defaults to {@link systemClock}). */
  clock?: Clock;
  /** Initial configured duration in seconds for tests (defaults to 15 min). */
  initialDurationSec?: number;
  /** Injectable {@link LogStore} (defaults to a localStorage-backed store). */
  logStore?: LogStore;
  /** Injectable auth client (defaults to the Option A browser auth client). */
  authClient?: BrowserAuthClient;
  /** Injectable Sheets connector (defaults to the Option A REST connector). */
  sheetsConnector?: BrowserSheetsConnector;
  /** Injectable notifier (defaults to the browser Notifications wrapper). */
  notifier?: Notifier;
  /** Injectable sound player (defaults to the Web Audio synth player). */
  sound?: SoundPlayer;
}

/** A `fetch` that always rejects — used as a fallback when no global `fetch` exists. */
const noopFetch = (() =>
  Promise.reject(new Error('fetch is unavailable in this environment'))) as unknown as typeof fetch;

export function App({
  clock = systemClock,
  initialDurationSec,
  logStore: logStoreProp,
  authClient: authClientProp,
  sheetsConnector: sheetsConnectorProp,
  notifier: notifierProp,
  sound: soundProp,
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
            : noopFetch,
      }),
    [sheetsConnectorProp, googleAuth],
  );

  // --- Timer state (lifted so prompt + log share the same session) ----------
  const timer = useTimer(clock, initialDurationSec);
  const { state, controls } = timer;

  // --- Notifications: OS notification on completion + tab-title countdown ----
  const notifier = useMemo<Notifier>(
    () => notifierProp ?? createBrowserNotifier(),
    [notifierProp],
  );

  // Track notification permission so the UI can show status and offer to enable.
  const [notifPermission, setNotifPermission] =
    useState<NotificationPermissionState>('default');
  useEffect(() => {
    setNotifPermission(notifier.permission());
  }, [notifier]);

  const enableNotifications = useCallback(() => {
    void notifier.requestPermission().then(setNotifPermission);
  }, [notifier]);

  // --- Sound: per-second ticking while running + chime on completion --------
  const sound = useMemo<SoundPlayer>(
    () => soundProp ?? createSoundPlayer(),
    [soundProp],
  );
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Mirror of the persisted sound selections so the settings panel re-renders.
  const [selStart, setSelStart] = useState(() => sound.getSelection('start'));
  const [selEnd, setSelEnd] = useState(() => sound.getSelection('end'));

  const handleSelectSound = useCallback(
    (kind: Parameters<typeof sound.setSelection>[0], id: string) => {
      sound.setSelection(kind, id);
      if (kind === 'start') setSelStart(id);
      else setSelEnd(id);
    },
    [sound],
  );

  const handlePreviewSound = useCallback(
    (kind: Parameters<typeof sound.preview>[0], id: string) => {
      sound.unlock();
      sound.preview(kind, id);
    },
    [sound],
  );

  // Release the audio context when App unmounts.
  useEffect(() => () => sound.dispose(), [sound]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((on) => {
      const next = !on;
      // Unlock audio on this gesture so the next start/alarm is audible.
      if (next) sound.unlock();
      return next;
    });
  }, [sound]);

  // Reflect the remaining time in the browser tab title so a backgrounded tab
  // still shows the countdown; announce completion there too.
  useEffect(() => {
    const base = 'FocusLog';
    if (state.status === 'running') {
      document.title = `${formatRemaining(state.remainingSec)} · ${base}`;
    } else if (state.status === 'paused') {
      document.title = `${formatRemaining(state.remainingSec)} (paused) · ${base}`;
    } else if (state.status === 'completed') {
      document.title = `⏰ Time's up! · ${base}`;
    } else {
      document.title = base;
    }
  }, [state.status, state.remainingSec]);

  // Fire a single OS notification when a session transitions to completed.
  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    if (prevStatusRef.current !== 'completed' && state.status === 'completed') {
      if (soundEnabled) sound.playAlarm();
      notifier.notify("Time's up!", {
        body: 'Click here to log what you did — the next session starts after.',
        tag: 'focuslog-session-complete',
        requireInteraction: true,
      });
    }
    prevStatusRef.current = state.status;
  }, [state.status, notifier, sound, soundEnabled]);

  // Wrap Start so the notification permission is requested and audio is
  // unlocked on the user gesture (both require a gesture).
  const handleStart = useCallback(() => {
    void notifier.requestPermission().then(setNotifPermission);
    sound.unlock();
    if (soundEnabled) sound.playStart();
    controls.start();
  }, [notifier, sound, soundEnabled, controls]);

  // The primary button plays its click sound on every press (Pause/Resume too).
  const handlePause = useCallback(() => {
    sound.unlock();
    if (soundEnabled) sound.playStart();
    controls.pause();
  }, [sound, soundEnabled, controls]);

  const handleResume = useCallback(() => {
    sound.unlock();
    if (soundEnabled) sound.playStart();
    controls.resume();
  }, [sound, soundEnabled, controls]);

  // --- Activity log + error state -------------------------------------------
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [activitySubmitError, setActivitySubmitError] = useState<string | null>(
    null,
  );
  /** Transient positive notice when an entry is written to Google Sheets. */
  const [writeNotice, setWriteNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<AppError[]>([]);
  const errorIdCounter = useRef(0);

  /** Push an app-level error onto the shared banner (newest first). */
  const pushError = useCallback((message: string) => {
    errorIdCounter.current += 1;
    const id = `err-${errorIdCounter.current}`;
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
      if (err instanceof Error) {
        pushError(err.message);
      }
    });
    // Instances are stable (useMemo); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Activity completion flow ---------------------------------------------
  const isPromptOpen = state.status === 'completed';

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
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">FocusLog</h1>
          <button
            type="button"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-ink/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16.42 12.58a1.5 1.5 0 0 0 .3 1.65l.05.05a1.82 1.82 0 0 1-2.57 2.57l-.05-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.91 1.37V18a1.82 1.82 0 0 1-3.64 0v-.08a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.05.05a1.82 1.82 0 0 1-2.57-2.57l.05-.05a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.91H2a1.82 1.82 0 0 1 0-3.64h.08a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.05-.05a1.82 1.82 0 0 1 2.57-2.57l.05.05a1.5 1.5 0 0 0 1.65.3h.07A1.5 1.5 0 0 0 8.31 2V2a1.82 1.82 0 0 1 3.64 0v.08a1.5 1.5 0 0 0 .91 1.37 1.5 1.5 0 0 0 1.65-.3l.05-.05a1.82 1.82 0 0 1 2.57 2.57l-.05.05a1.5 1.5 0 0 0-.3 1.65v.07A1.5 1.5 0 0 0 18 8.31H18a1.82 1.82 0 0 1 0 3.64h-.08a1.5 1.5 0 0 0-1.5.63Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        selStart={selStart}
        selEnd={selEnd}
        onSelectSound={handleSelectSound}
        onPreviewSound={handlePreviewSound}
        notifPermission={notifPermission}
        onEnableNotifications={enableNotifications}
      />

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
        {/* Video — compact centered preview with label */}
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            How to boost productivity?
          </h2>
          <div className="w-48 overflow-hidden rounded-3xl border border-black/5 bg-white shadow-card sm:w-56">
            <div className="relative w-full" style={{ paddingBottom: '177.78%' /* 9:16 for Shorts */ }}>
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube.com/embed/om_6WSfRLZ8?rel=0&modestbranding=1"
                title="Why this app exists"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>

        {/* Primary content: the timer */}
        <TimerScreen
          clock={clock}
          timer={{
            state,
            controls: {
              ...controls,
              start: handleStart,
              pause: handlePause,
              resume: handleResume,
            },
          }}
        />

        {/* Activity log — Export CSV button lives in the header. */}
        <ActivityLogView entries={entries} exportBar={<ExportBar entries={entries} />} />

        {/* Google Sheets — label left, connect button right, no accordion. */}
        <CollapsibleSection
          label="Write to Google Sheets"
          description="Write sessions straight to a spreadsheet you control."
        >
          <GoogleSheetsPanel
            authClient={authClient}
            sheetsConnector={sheetsConnector}
            onError={pushError}
          />
        </CollapsibleSection>
      </main>

      {/* Completion prompt; retains entered text on append/persist failure. */}
      <ActivityPrompt
        open={isPromptOpen}
        onSubmit={handleActivitySubmit}
        submitError={activitySubmitError}
      />
    </div>
  );
}
