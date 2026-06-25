/**
 * `TimerDisplay` (UI layer) — task 13.2.
 *
 * Presentational component that renders the remaining time in `MM:SS` format
 * (Req 1.3) via the pure {@link formatRemaining} helper, and shows a visible
 * default-fallback indication when the configured duration was unavailable and
 * the timer fell back to the Default_Duration of 15:00 (Req 1.5, 2.5).
 *
 * This component is intentionally standalone and stateless: it makes no timer
 * decisions and holds no state. Wiring into `TimerScreen` happens in task 14.1.
 *
 * Accessibility: the time is exposed as an ARIA `timer` with a polite live
 * region so assistive technologies announce updates without interrupting.
 *
 * _Requirements: 1.3, 1.5, 2.5_
 */
import { formatRemaining } from '../domain/timeFormat';

export interface TimerDisplayProps {
  /** Non-negative whole number of remaining seconds to display. */
  remainingSec: number;
  /**
   * When true, the configured duration was unavailable and the timer is using
   * the Default_Duration of 15:00. A visible badge is shown (Req 1.5, 2.5).
   */
  usingDefaultFallback?: boolean;
}

/**
 * Render the remaining time as `MM:SS`, with an optional default-fallback badge.
 */
export function TimerDisplay({
  remainingSec,
  usingDefaultFallback = false,
}: TimerDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <output
        role="timer"
        aria-label="Remaining time"
        aria-live="polite"
        className="font-mono text-6xl tabular-nums tracking-tight"
      >
        {formatRemaining(remainingSec)}
      </output>

      {usingDefaultFallback && (
        <p
          role="status"
          className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800"
        >
          Using default duration (15:00)
        </p>
      )}
    </div>
  );
}
