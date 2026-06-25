/**
 * App-level error and default-path tests (task 14.3).
 *
 * Covers the application wiring's error handling and default behaviour:
 * - Default duration of 15:00 when none is configured (Req 2.2).
 * - Fallback to 15:00 with a visible indication when the configured duration is
 *   invalid/unavailable (Req 1.5, 2.5) — driven through the pure engine plus a
 *   focused render assertion on {@link TimerDisplay}.
 * - Append/persist failure keeps the activity prompt open with the entered text
 *   retained and surfaces an error (Req 7.5).
 * - Auth-store retrieval failure is surfaced on the shared banner WITHOUT
 *   discarding the Activity_Log (Req 11.8).
 * - A display-update error keeps existing entries visible (Req 8.4, 8.5).
 */
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from './App';
import { TimerDisplay } from './TimerDisplay';
import { ActivityLogView } from './ActivityLogView';
import { timerEngine, DEFAULT_DURATION_SEC } from '../domain/timerEngine';
import { createFakeClock } from '../infra/clock';
import { createFakeStorage } from '../infra/fakeStorage';
import { createLogStore } from '../infra/logStore';
import { AuthStoreError, type BrowserAuthClient } from '../infra/authClient';
import type { BrowserSheetsConnector } from '../infra/googleSheets';
import type { LogEntry } from '../types';

/* -------------------------------------------------------------------------- */
/* Test doubles                                                                */
/* -------------------------------------------------------------------------- */

/** A disconnected stub {@link BrowserAuthClient}; individual methods are overridable. */
function makeStubAuth(
  overrides: Partial<BrowserAuthClient> = {},
): BrowserAuthClient {
  return {
    getStatus: () => Promise.resolve({ connected: false, expiresAtMs: null }),
    connect: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    getMeta: () => ({ connected: false, expiresAtMs: null, targetSheetId: null }),
    getTargetSheetId: () => null,
    setTargetSheetId: () => {},
    needsReauth: () => true,
    ...overrides,
  };
}

/** An inert stub {@link BrowserSheetsConnector}; never exercised by these tests. */
function makeStubConnector(): BrowserSheetsConnector {
  return {
    createSheet: () => Promise.reject(new Error('not used')),
    selectSheet: () => Promise.reject(new Error('not used')),
    appendRow: () => Promise.reject(new Error('not used')),
  } as unknown as BrowserSheetsConnector;
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'e1',
    date: '2024-01-02',
    startTime: '09:00:00',
    endTime: '09:15:00',
    description: 'design work',
    startEpochMs: 1_000,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe('App default duration', () => {
  test('initializes the timer to 15:00 when no duration is configured (Req 2.2)', async () => {
    render(
      <App
        logStore={createLogStore(createFakeStorage())}
        authClient={makeStubAuth()}
        sheetsConnector={makeStubConnector()}
      />,
    );
    // Let the panel's async mount status settle inside act().
    await act(async () => {});

    expect(screen.getByRole('timer')).toHaveTextContent('15:00');
    // The default duration is in genuine use, so no fallback badge is shown.
    expect(screen.queryByText(/using default duration/i)).toBeNull();
  });
});

describe('Default-duration fallback indication (Req 1.5, 2.5)', () => {
  test('falls back to 15:00 with a visible indication for an invalid configured duration', () => {
    // Drive the fallback through the pure engine init path.
    const state = timerEngine.init(Number.NaN);
    expect(state.usingDefaultFallback).toBe(true);
    expect(state.remainingSec).toBe(DEFAULT_DURATION_SEC);

    render(
      <TimerDisplay
        remainingSec={state.remainingSec}
        usingDefaultFallback={state.usingDefaultFallback}
      />,
    );

    expect(screen.getByRole('timer')).toHaveTextContent('15:00');
    expect(
      screen.getByText(/using default duration \(15:00\)/i),
    ).toBeInTheDocument();
  });
});

describe('Append/persist failure retention (Req 7.5)', () => {
  test('keeps the prompt open with retained text and surfaces a save error', async () => {
    vi.useFakeTimers();
    const clock = createFakeClock(0);
    // A LogStore whose underlying write always fails (Req 9.5 surfaced via 7.5).
    const failingStore = createLogStore(
      createFakeStorage({ failOnSet: new Error('quota exceeded') }),
    );

    render(
      <App
        clock={clock}
        logStore={failingStore}
        authClient={makeStubAuth()}
        sheetsConnector={makeStubConnector()}
      />,
    );
    // Let the panel's async mount status settle inside act().
    await act(async () => {});

    // Configure a 1-minute session so it can complete quickly, then start it.
    const durationInput = screen.getByRole('spinbutton');
    fireEvent.change(durationInput, { target: { value: '1' } });
    fireEvent.blur(durationInput);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Advance wall-clock past the end and fire the countdown tick to complete.
    act(() => {
      clock.advance(60_000);
      vi.advanceTimersByTime(300);
    });

    // The activity prompt is now open; submit a valid description.
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrote tests' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    // The prompt stays open with the entered text retained (Req 7.5).
    const stillOpen = screen.getByRole('dialog');
    expect(stillOpen).toBeInTheDocument();
    expect(
      (within(stillOpen).getByRole('textbox') as HTMLInputElement).value,
    ).toBe('wrote tests');

    // An error is surfaced in the prompt (retry affordance) ...
    expect(within(stillOpen).getByRole('alert')).toHaveTextContent(
      /could not save the entry/i,
    );
    // ... and the underlying save failure is surfaced on the shared banner.
    const alerts = screen.getAllByRole('alert');
    expect(
      alerts.some((el) => /failed to save activity log/i.test(el.textContent ?? '')),
    ).toBe(true);
  });
});

describe('Auth-store failure handling (Req 11.8)', () => {
  test('surfaces the error on the banner without discarding the activity log', async () => {
    // Preload a persisted entry so we can prove the log is not discarded.
    const storage = createFakeStorage();
    const store = createLogStore(storage);
    const saved = store.save([makeEntry({ description: 'kept work' })]);
    expect(saved.ok).toBe(true);

    const authStoreMessage =
      'Failed to read the saved Google connection status. You can sign in again.';
    const failingAuth = makeStubAuth({
      getStatus: () =>
        Promise.reject(new AuthStoreError('retrieve', authStoreMessage)),
    });

    render(
      <App
        logStore={store}
        authClient={failingAuth}
        sheetsConnector={makeStubConnector()}
      />,
    );

    // The previously persisted entry remains displayed (log not discarded).
    expect(screen.getByText('kept work')).toBeInTheDocument();

    // The auth-store failure is surfaced (banner and/or panel) once resolved.
    const surfaced = await screen.findAllByText(new RegExp(authStoreMessage, 'i'));
    expect(surfaced.length).toBeGreaterThan(0);

    // The entry is still present after the error surfaces.
    expect(screen.getByText('kept work')).toBeInTheDocument();
  });
});

describe('Display-update error keeps entries visible (Req 8.4, 8.5)', () => {
  test('shows an error indication while preserving the existing entries', () => {
    const entries = [makeEntry({ description: 'kept entry' })];

    render(
      <ActivityLogView
        entries={entries}
        error="display update failed after 3 retries"
      />,
    );

    // Existing entry is preserved while the error indication is shown.
    expect(screen.getByText('kept entry')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be updated/i);
  });
});
