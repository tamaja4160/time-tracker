/**
 * `DurationInput` (UI layer) — task 13.2.
 *
 * Controlled input that lets the user set the Configured_Duration in whole
 * minutes (1–999 inclusive). It is disabled while a session is running so the
 * duration cannot be changed mid-session (Req 2.1).
 *
 * Validation is delegated to the pure {@link parseDuration} helper. On invalid
 * input the value is rejected inline: the component shows an error indication
 * and does NOT call {@link DurationInputProps.onCommit}, so the parent retains
 * the previous Configured_Duration (Req 2.4). Only whole minutes in [1, 999]
 * are committed.
 *
 * This component is standalone and presentational: it owns only the transient
 * text being edited and an error flag. The committed duration lives in the
 * parent. Wiring into `TimerScreen` happens in task 14.1.
 *
 * _Requirements: 1.2, 2.1, 2.4_
 */
import { useEffect, useId, useState } from 'react';
import { parseDuration } from '../domain/validation';

const SECONDS_PER_MINUTE = 60;

export interface DurationInputProps {
  /**
   * The currently committed Configured_Duration, in seconds. The input's
   * displayed value is derived from this whole-minute value and re-synced
   * whenever it changes (e.g. after a successful commit or a reset).
   */
  configuredDurationSec: number;
  /** Disable editing (e.g. while a session is running; Req 2.1). */
  disabled?: boolean;
  /**
   * Called only with a VALID whole-minute value in [1, 999]. Invalid input is
   * rejected inline and never reaches this callback (Req 2.4).
   */
  onCommit: (minutes: number) => void;
}

/** Derive the whole-minute value shown in the field from a seconds duration. */
function toMinutes(configuredDurationSec: number): number {
  return Math.round(configuredDurationSec / SECONDS_PER_MINUTE);
}

/**
 * A controlled minutes input that validates and commits the Configured_Duration.
 */
export function DurationInput({
  configuredDurationSec,
  disabled = false,
  onCommit,
}: DurationInputProps) {
  const committedMinutes = toMinutes(configuredDurationSec);
  const [text, setText] = useState<string>(String(committedMinutes));
  const [hasError, setHasError] = useState(false);
  const errorId = useId();

  // Re-sync the field whenever the committed duration changes externally
  // (successful commit, reset, fallback). This also clears a stale error.
  useEffect(() => {
    setText(String(committedMinutes));
    setHasError(false);
  }, [committedMinutes]);

  function commit(raw: string): void {
    const result = parseDuration(raw);
    if (result.ok) {
      setHasError(false);
      onCommit(result.minutes);
    } else {
      // Reject inline: keep the prior duration (do not call onCommit) and show
      // an error indication (Req 2.4).
      setHasError(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <span>Duration (minutes)</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          step={1}
          value={text}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(event) => {
            setText(event.target.value);
            if (hasError) {
              setHasError(false);
            }
          }}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit((event.target as HTMLInputElement).value);
            }
          }}
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-center font-mono tabular-nums disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 aria-[invalid=true]:border-red-500"
        />
      </label>

      {hasError && (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          Enter a whole number of minutes between 1 and 999.
        </p>
      )}
    </div>
  );
}
