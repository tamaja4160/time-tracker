/**
 * Component / DOM tests with fake timers (task 14.2).
 *
 * These tests exercise the wired `App` through the rendered DOM using React
 * Testing Library, driving the countdown with Vitest fake timers paired with
 * an injectable fake clock so timing is fully deterministic. The pure domain
 * logic is covered by property tests elsewhere; here we validate the
 * render-and-timing behaviour that only shows up once the components are
 * mounted:
 *
 * - Timer present as primary content on initial render (Req 1.1).
 * - The displayed remaining time updates at a 1-second cadence (Req 1.4).
 * - Pause stops the countdown and reset returns to the full configured
 *   duration in the not-running state (Req 4.1, 5.1).
 * - The activity log updates live when a completed session is logged (Req 8.3).
 *
 * _Requirements: 1.1, 1.4, 4.1, 5.1, 8.3_
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LogEntry, LogStore, Result } from '../types';
import { createFakeClock, type FakeClock } from '../infra/clock';
import type { BrowserAuthClient } from '../infra/authClient';
import type { BrowserSheetsConnector } from '../infra/googleSheets';
import { App } from './App';

const SECONDS_PER_MINUTE = 60;

/**
 * In-memory {@link LogStore} so the completion flow can persist without touching
 * `localStorage`. Always succeeds; retains whatever was last saved.
 */
function makeInMemoryLogStore(initial: LogEntry[] = []): LogStore {
  let saved: LogEntry[] = initial;
  return {
    load(): Result<LogEntry[]> {
      return { ok: true, value: saved };
    },
    save(log: LogEntry[]): Result<void> {
      saved = log;
      return { ok: true, value: undefined };
    },
  };
}

/**
 * Minimal disconnected auth client so the Google panel renders deterministically
 * (no GIS / network). Reports "not connected" and no target sheet.
 */
function makeFakeAuthClient(): BrowserAuthClient {
  return {
    getStatus: async () => ({ connected: false, expiresAtMs: null }),
    needsReauth: () => false,
    getTargetSheetId: () => null,
    setTargetSheetId: () => {},
    connect: async () => {},
    signOut: async () => {},
  } as unknown as BrowserAuthClient;
}

/** Inert Sheets connector; never exercised in these timer/log tests. */
function makeFakeSheetsConnector(): BrowserSheetsConnector {
  const target = {
    spreadsheetId: 'fake-sheet',
    sheetTitle: 'Fake',
    hasRequiredColumns: true,
  };
  return {
    createSheet: async () => target,
    selectSheet: async () => target,
    appendRow: async () => {},
  } as unknown as BrowserSheetsConnector;
}

/**
 * Render the wired `App` with deterministic fakes and a controllable clock,
 * then flush the mount-time async status read so no act warnings leak.
 */
async function renderApp(clock: FakeClock) {
  const utils = render(
    <App
      clock={clock}
      logStore={makeInMemoryLogStore()}
      authClient={makeFakeAuthClient()}
      sheetsConnector={makeFakeSheetsConnector()}
    />,
  );
  // Flush the mount effect's async getStatus() resolution (microtask).
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

describe('App component/DOM behaviour (fake timers)', () => {
  let clock: FakeClock;

  beforeEach(() => {
    vi.useFakeTimers();
    // A fixed, realistic start instant keeps log-entry formatting stable.
    clock = createFakeClock(Date.UTC(2025, 0, 15, 9, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Advance BOTH the injected clock and Vitest's timer queue together so the
   * 250 ms tick interval fires and each `tick` reads the advanced wall-clock.
   */
  function advance(ms: number): void {
    act(() => {
      clock.advance(ms);
      vi.advanceTimersByTime(ms);
    });
  }

  function startSession(): void {
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
  }

  test('renders the timer as primary content on initial load (Req 1.1)', async () => {
    await renderApp(clock);

    const timer = screen.getByRole('timer');
    expect(timer).toBeInTheDocument();
    // Idle timer shows the full Default_Duration (15:00).
    expect(timer).toHaveTextContent('15:00');
  });

  test('updates the displayed remaining time once per second while running (Req 1.4)', async () => {
    await renderApp(clock);

    expect(screen.getByRole('timer')).toHaveTextContent('15:00');

    startSession();

    advance(1000);
    expect(screen.getByRole('timer')).toHaveTextContent('14:59');

    advance(1000);
    expect(screen.getByRole('timer')).toHaveTextContent('14:58');

    advance(3000);
    expect(screen.getByRole('timer')).toHaveTextContent('14:55');
  });

  test('pause stops the countdown so remaining time no longer changes (Req 4.1)', async () => {
    await renderApp(clock);

    startSession();
    advance(2000);
    expect(screen.getByRole('timer')).toHaveTextContent('14:58');

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(screen.getByRole('timer')).toHaveTextContent('14:58');

    // Time keeps passing, but a paused timer must not decrement.
    advance(5000);
    expect(screen.getByRole('timer')).toHaveTextContent('14:58');
  });

  test('reset returns to the full configured duration in the not-running state (Req 5.1)', async () => {
    await renderApp(clock);

    startSession();
    advance(3000);
    expect(screen.getByRole('timer')).toHaveTextContent('14:57');

    // Reset is gated by a full-duration confirmation affordance (Req 5.5).
    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm reset/i }));

    // Back to the full configured duration, not running (Start is offered again).
    expect(screen.getByRole('timer')).toHaveTextContent('15:00');
    expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
  });

  test('logs a completed session and shows it live in the activity log (Req 8.3)', async () => {
    await renderApp(clock);

    // Empty-state initially: no entries logged yet.
    expect(
      screen.getByText(/no activity has been logged yet/i),
    ).toBeInTheDocument();

    // Use a 1-minute session to reach completion quickly and deterministically.
    const durationInput = screen.getByLabelText(/duration \(minutes\)/i);
    fireEvent.change(durationInput, { target: { value: '1' } });
    fireEvent.blur(durationInput);
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');

    startSession();

    // Advance to (and past) zero: the session completes and the prompt opens.
    advance(SECONDS_PER_MINUTE * 1000);

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('What did you do (1 or 2 words)?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');

    // Submit a valid description; the entry should appear in the log live.
    const input = within(dialog).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'wrote tests' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.getByText('wrote tests')).toBeInTheDocument();
    // The prompt closed and the empty-state is gone now there is an entry.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no activity has been logged yet/i),
    ).not.toBeInTheDocument();
  });
});
