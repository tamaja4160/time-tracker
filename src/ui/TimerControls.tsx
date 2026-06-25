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
    'inline-flex items-center justify-center rounded-full px-7 py-2.5 text-base font-medium ' +
    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-ring disabled:opacity-50';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3" role="group" aria-label="Timer controls">
        {(status === 'idle' || status === 'completed') && (
          <button
            type="button"
            onClick={onStart}
            className={`${buttonClass} bg-accent text-white shadow-sm hover:bg-accent-hover`}
          >
            Start
          </button>
        )}

        {status === 'running' && (
          <button
            type="button"
            onClick={onPause}
            className={`${buttonClass} bg-ink/5 text-ink hover:bg-ink/10`}
          >
            Pause
          </button>
        )}

        {status === 'paused' && (
          <button
            type="button"
            onClick={onResume}
            className={`${buttonClass} bg-accent text-white shadow-sm hover:bg-accent-hover`}
          >
            Resume
          </button>
        )}

        {/* Reset is only present while there is a session to reset (Req 5.4). */}
        {showReset && !confirmingReset && (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-base font-medium text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-ring"
          >
            Reset
          </button>
        )}
      </div>

      {/* Full-duration confirmation affordance for reset (Req 5.5). */}
      {showReset && confirmingReset && (
        <div
          className="flex flex-col items-center gap-3 rounded-3xl border border-black/5 bg-canvas p-4"
          role="group"
          aria-label="Confirm reset"
        >
          <p className="text-sm text-ink-soft">{confirmPrompt}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirmReset}
              className={`${buttonClass} bg-[#ff3b30] text-white hover:bg-[#ff453a]`}
            >
              Confirm reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className={`${buttonClass} bg-white text-ink ring-1 ring-inset ring-black/10 hover:bg-ink/5`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Transient not-applicable / already-running indication (Req 3.2, 4.5, 4.6). */}
      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm text-amber-700">
        {transientMessage}
      </p>
    </div>
  );
}
