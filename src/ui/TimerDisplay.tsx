/**
 * `TimerDisplay` (UI layer).
 *
 * Presentational component that renders the remaining time in `MM:SS` format
 * (Req 1.3) via the pure {@link formatRemaining} helper, inside a circular
 * progress ring, and shows a visible default-fallback indication when the
 * configured duration was unavailable and the timer fell back to the
 * Default_Duration of 15:00 (Req 1.5, 2.5).
 *
 * This component is intentionally standalone and stateless: it makes no timer
 * decisions and holds no state.
 *
 * Accessibility: the time is exposed as an ARIA `timer` with a polite live
 * region so assistive technologies announce updates without interrupting.
 *
 * _Requirements: 1.3, 1.5, 2.5_
 */
import type { TimerStatus } from '../types/timer';
import { formatRemaining } from '../domain/timeFormat';

export interface TimerDisplayProps {
  /** Non-negative whole number of remaining seconds to display. */
  remainingSec: number;
  /** Configured duration in seconds, used to draw the progress ring. */
  configuredDurationSec?: number;
  /** Current status, used for the small caption under the time. */
  status?: TimerStatus;
  /**
   * When true, the configured duration was unavailable and the timer is using
   * the Default_Duration of 15:00. A visible badge is shown (Req 1.5, 2.5).
   */
  usingDefaultFallback?: boolean;
}

const RING_SIZE = 300;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Human caption for the current status, shown beneath the time. */
function statusCaption(status: TimerStatus | undefined): string {
  switch (status) {
    case 'running':
      return 'Focusing';
    case 'paused':
      return 'Paused';
    case 'completed':
      return "Time's up";
    default:
      return 'Ready';
  }
}

/**
 * Render the remaining time as `MM:SS` inside a progress ring, with an optional
 * default-fallback badge.
 */
export function TimerDisplay({
  remainingSec,
  configuredDurationSec,
  status,
  usingDefaultFallback = false,
}: TimerDisplayProps) {
  // Fraction elapsed → how much of the ring is "spent". When no configured
  // duration is provided (e.g. isolated rendering), show a full ring.
  const total =
    configuredDurationSec && configuredDurationSec > 0
      ? configuredDurationSec
      : null;
  const remainingFraction =
    total !== null ? Math.max(0, Math.min(1, remainingSec / total)) : 1;
  const dashOffset = RING_CIRCUMFERENCE * (1 - remainingFraction);

  const isPaused = status === 'paused';
  const isDone = status === 'completed';
  const progressColor = isDone
    ? '#34c759' // green when complete
    : isPaused
      ? '#ff9f0a' // amber when paused
      : '#0071e3'; // accent blue while running/idle

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className="relative grid place-items-center"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="#e8e8ed"
            strokeWidth={RING_STROKE}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={progressColor}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s ease' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <output
            role="timer"
            aria-label="Remaining time"
            aria-live="polite"
            className="font-sans text-7xl font-light tabular-nums tracking-tight text-ink"
          >
            {formatRemaining(remainingSec)}
          </output>
          <span className="text-sm font-medium uppercase tracking-[0.18em] text-ink-muted">
            {statusCaption(status)}
          </span>
        </div>
      </div>

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
