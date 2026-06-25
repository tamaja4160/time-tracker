/**
 * TimerControls — standalone presentational timer controls (task 13.3).
 *
 * Renders the Start / Pause / Resume / Reset controls mapped to the engine
 * actions and surfaces transient "not applicable / already running" feedback.
 * It holds no timer state of its own; the parent owns `TimerState` and passes
 * the current `status` plus the engine action callbacks. Wiring into the
 * application reducer happens in task 14.1.
 *
 * Behaviour:
 * - The relevant action is shown per status: Start when idle or completed,
 *   Pause while running, Resume while paused (Req 4.1, 5.1).
 * - The Reset control is hidden while idle or completed — there is nothing to
 *   reset in those states (Req 5.4).
 * - Reset is gated by a visible full-duration confirmation affordance: the user
 *   confirms returning the timer to the full configured duration before
 *   `onReset` is called (Req 5.5).
 * - When the most recent transition was not applicable (`lastTransition`
 *   carries `applicable === false`), a transient indication is surfaced, e.g.
 *   start-while-running, pause-while-not-running, resume-while-not-paused
 *   (Req 3.2, 4.5, 4.6).
 *
 * _Requirements: 3.2, 4.1, 4.5, 4.6, 5.1, 5.4, 5.5_
 */
import { useEffect, useState } from 'react';
import type { TimerStatus, TimerTransitionOutcome } from '../types/timer';
import { formatRemaining } from '../domain/timeFormat';

export interface TimerControlsProps {
  /** Current timer status; selects which primary action is shown. */
  status: TimerStatus;
  /** Transient outcome of the most recent transition (Req 3.2, 4.5, 4.6). */
  lastTransition?: TimerTransitionOutcome;
  /**
   * Configured duration in seconds, used to show the full duration the reset
   * confirmation returns the timer to (Req 5.5). Optional; when omitted the
   * confirmation message omits the concrete time.
   */
  configuredDurationSec?: number;
  /** Begin a new session (idle/completed). */
  onStart: () => void;
  /** Pause a running session. */
  onPause: () => void;
  /** Resume a paused session. */
  onResume: () => void;
  /** Reset to the not-running state at the full configured duration. */
  onReset: () => void;
}

/** How long a not-applicable indication remains visible before auto-dismiss. */
const TRANSIENT_MESSAGE_MS = 4000;

/**
 * Build the human-readable message for a not-applicable transition outcome.
 * Returns `null` when the outcome is applicable or absent (nothing to show).
 */
function notApplicableMessage(
  outcome: TimerTransitionOutcome | undefined,
): string | null {
  if (!outcome || outcome.applicable) {
    return null;
  }
  switch (outcome.action) {
    case 'start':
      return 'A session is already in progress.';
    case 'pause':
      return 'Pause is not available right now.';
    case 'resume':
      return 'Resume is not available right now.';
    default:
      return 'That action is not available right now.';
  }
}

export function TimerControls({
  status,
  lastTransition,
  configuredDurationSec,
  onStart,
  onPause,
  onResume,
  onReset,
}: TimerControlsProps) {
  // Whether the inline "Reset to full duration?" confirmation is showing.
  const [confirmingReset, setConfirmingReset] = useState(false);
  // The transient not-applicable message currently shown, if any.
  const [transientMessage, setTransientMessage] = useState<string | null>(null);

  const showReset = status === 'running' || status === 'paused';

  // Surface a transient indication whenever a new not-applicable transition
  // outcome arrives, then auto-dismiss it (Req 3.2, 4.5, 4.6).
  useEffect(() => {
    const message = notApplicableMessage(lastTransition);
    if (message === null) {
      return;
    }
    setTransientMessage(message);
    const handle = setTimeout(() => setTransientMessage(null), TRANSIENT_MESSAGE_MS);
    return () => clearTimeout(handle);
  }, [lastTransition]);

  // If we leave a resettable state (e.g. the timer completes), drop any
  // pending reset confirmation so it cannot apply to the wrong state.
  useEffect(() => {
    if (!showReset) {
      setConfirmingReset(false);
    }
  }, [showReset]);

  const fullDurationLabel =
    configuredDurationSec !== undefined && Number.isFinite(configuredDurationSec)
      ? formatRemaining(Math.max(0, configuredDurationSec))
      : null;

  const confirmPrompt =
    fullDurationLabel !== null
      ? `Reset to full duration (${fullDurationLabel})?`
      : 'Reset to full duration?';

  const handleConfirmReset = () => {
    setConfirmingReset(false);
    onReset();
  };

  const buttonClass =
    'rounded-md px-4 py-2 text-sm font-medium focus:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-offset-2';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Timer controls">
        {(status === 'idle' || status === 'completed') && (
          <button
            type="button"
            onClick={onStart}
            className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600`}
          >
            Start
          </button>
        )}

        {status === 'running' && (
          <button
            type="button"
            onClick={onPause}
            className={`${buttonClass} bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500`}
          >
            Pause
          </button>
        )}

        {status === 'paused' && (
          <button
            type="button"
            onClick={onResume}
            className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600`}
          >
            Resume
          </button>
        )}

        {/* Reset is only present while there is a session to reset (Req 5.4). */}
        {showReset && !confirmingReset && (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className={`${buttonClass} bg-slate-200 text-slate-900 hover:bg-slate-300 focus-visible:ring-slate-400`}
          >
            Reset
          </button>
        )}
      </div>

      {/* Full-duration confirmation affordance for reset (Req 5.5). */}
      {showReset && confirmingReset && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-slate-50 p-3"
          role="group"
          aria-label="Confirm reset"
        >
          <p className="text-sm text-slate-700">{confirmPrompt}</p>
          <button
            type="button"
            onClick={handleConfirmReset}
            className={`${buttonClass} bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600`}
          >
            Confirm reset
          </button>
          <button
            type="button"
            onClick={() => setConfirmingReset(false)}
            className={`${buttonClass} bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-100 focus-visible:ring-slate-400`}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Transient not-applicable / already-running indication (Req 3.2, 4.5, 4.6). */}
      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm text-amber-700">
        {transientMessage}
      </p>
    </div>
  );
}
