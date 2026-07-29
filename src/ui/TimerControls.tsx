/**
 * TimerControls — a single 3D push-button plus an immediate Reset (task 13.3,
 * refined).
 *
 * The primary control is one button that stays in the same place and changes
 * only its label and pressed state:
 * - idle / completed → "Start"  (button extended / popped out)
 * - running          → "Pause"  (button pressed / held in)
 * - paused           → "Resume" (button extended)
 *
 * So clicking it "presses it in" (starts/resumes → running) and clicking again
 * "lets it out" (pauses). Reset returns the timer to the full configured
 * duration immediately (no confirmation step) and is only shown while there is
 * a session to reset (Req 5.4).
 *
 * It holds no timer state of its own; the parent owns `TimerState` and passes
 * the current `status` plus the engine action callbacks.
 *
 * _Requirements: 3.2, 4.1, 4.5, 4.6, 5.1, 5.4_
 */
import { useEffect, useState } from 'react';
import type { TimerStatus, TimerTransitionOutcome } from '../types/timer';

export interface TimerControlsProps {
  /** Current timer status; selects the primary button's label + pressed state. */
  status: TimerStatus;
  /** Transient outcome of the most recent transition (Req 3.2, 4.5, 4.6). */
  lastTransition?: TimerTransitionOutcome;
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

function notApplicableMessage(
  outcome: TimerTransitionOutcome | undefined,
): string | null {
  if (!outcome || outcome.applicable) return null;
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
  onStart,
  onPause,
  onResume,
  onReset,
}: TimerControlsProps) {
  const [transientMessage, setTransientMessage] = useState<string | null>(null);

  const showReset = status === 'running' || status === 'paused';

  useEffect(() => {
    const message = notApplicableMessage(lastTransition);
    if (message === null) return;
    setTransientMessage(message);
    const handle = setTimeout(() => setTransientMessage(null), TRANSIENT_MESSAGE_MS);
    return () => clearTimeout(handle);
  }, [lastTransition]);

  // Map status → the single primary control's label, action, and pressed state.
  const primary =
    status === 'running'
      ? { label: 'Pause', onClick: onPause, pressed: true }
      : status === 'paused'
        ? { label: 'Resume', onClick: onResume, pressed: false }
        : { label: 'Start', onClick: onStart, pressed: false };

  // Classic 3D push button. Extended = face + a solid bottom edge (shadow).
  // Pressed = the face translated DOWN by the edge height with the shadow
  // removed, so the width is identical and only the height is smaller by the
  // edge amount. The wrapper's bottom padding reserves the edge height so
  // siblings never shift. Class strings are literal for Tailwind's JIT.
  const base =
    'relative select-none rounded-2xl w-44 py-4 text-center text-lg font-semibold text-white bg-accent ' +
    'transition-[transform,box-shadow] duration-100 ease-out focus:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2';
  const pressedClasses = 'translate-y-[7px] shadow-none';
  const extendedClasses =
    'shadow-[0_7px_0_#0656b0] hover:bg-accent-hover active:translate-y-[7px] active:shadow-none';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-start justify-center pb-[7px]">
        <button
          type="button"
          onClick={primary.onClick}
          aria-pressed={primary.pressed}
          className={`${base} ${primary.pressed ? pressedClasses : extendedClasses}`}
        >
          {primary.label}
        </button>
      </div>

      {/* Immediate reset (no confirmation); only while there's a session. */}
      <div className="flex h-7 items-center">
        {showReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-full px-5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
          >
            Reset
          </button>
        )}
      </div>

      {/* Transient not-applicable indication (Req 3.2, 4.5, 4.6). */}
      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm text-amber-700">
        {transientMessage}
      </p>
    </div>
  );
}
