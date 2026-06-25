/**
 * `ActivityPrompt` (UI layer) — task 13.4.
 *
 * Accessible modal dialog shown when a session completes (the caller renders it
 * when the timer status is `'completed'`, which keeps the displayed time at
 * zero until a new session starts — Req 6.3). It presents the exact prompt copy
 * "What did you do (1 or 2 words)?" and collects an Activity_Description of
 * 1–50 characters (Req 6.1, 6.2).
 *
 * Validation is delegated to the pure {@link validateDescription} helper, which
 * trims and bounds the input. On submit:
 *  - valid   → calls {@link ActivityPromptProps.onSubmit} with the trimmed text
 *              (Req 6.4).
 *  - empty   → keeps the entered text and shows a "non-empty required" message
 *              (Req 6.5).
 *  - too long→ keeps the entered text and shows the 50-character maximum message
 *              (Req 6.6).
 * The prompt does not close or submit until a valid description is provided.
 *
 * `submitError` lets the parent surface an append/persist failure while the
 * entered text is retained so the user can retry (Req 7.5). This component is
 * presentational and owns only the transient text and validation message; the
 * timer/session lifecycle and wiring into `TimerScreen` happen in task 14.1.
 *
 * _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
 */
import { useEffect, useId, useRef, useState } from 'react';
import { validateDescription } from '../domain/validation';

/** Exact activity prompt copy mandated by Req 6.1. Rendered verbatim. */
export const ACTIVITY_PROMPT_MESSAGE = 'What did you do (1 or 2 words)?';

const EMPTY_MESSAGE = 'Please enter a non-empty description.';
const TOO_LONG_MESSAGE = 'Description must be 50 characters or fewer.';

export interface ActivityPromptProps {
  /** Whether the modal is open (caller opens it on session completion). */
  open: boolean;
  /**
   * Called only with a VALID trimmed description (1–50 chars). Invalid input is
   * rejected inline and never reaches this callback (Req 6.4-6.6).
   */
  onSubmit: (description: string) => void;
  /**
   * Optional error from the parent's append/persist attempt. When present the
   * entered text is retained so the user can retry without re-typing (Req 7.5).
   */
  submitError?: string | null;
}

/**
 * Accessible modal that collects the Activity_Description for a completed
 * session.
 */
export function ActivityPrompt({ open, onSubmit, submitError }: ActivityPromptProps) {
  const [text, setText] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const errorId = useId();

  // Reset transient state and focus the input each time the prompt opens
  // (accessibility: move focus into the dialog on open).
  useEffect(() => {
    if (open) {
      setText('');
      setValidationMessage(null);
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    const result = validateDescription(text);
    if (result.ok) {
      // Block close/submit until valid; on success hand the trimmed value up.
      setValidationMessage(null);
      onSubmit(result.value);
      return;
    }
    // Retain the entered text and show the reason-specific message (Req 6.5, 6.6).
    setValidationMessage(result.reason === 'empty' ? EMPTY_MESSAGE : TOO_LONG_MESSAGE);
  }

  // Surface either the inline validation message or the parent's submit error.
  const message = validationMessage ?? submitError ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-4xl bg-white p-7 shadow-card-lg animate-scale-in"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5 text-center">
            <h2 id={titleId} className="text-xl font-semibold tracking-tight text-ink">
              {ACTIVITY_PROMPT_MESSAGE}
            </h2>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={text}
            maxLength={100}
            placeholder="e.g. wrote design"
            aria-invalid={message != null}
            aria-describedby={message != null ? errorId : undefined}
            onChange={(event) => {
              setText(event.target.value);
              if (validationMessage != null) {
                setValidationMessage(null);
              }
            }}
            className="w-full rounded-2xl border border-black/10 bg-canvas px-4 py-3 text-center text-lg text-ink transition focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-ring/30 aria-[invalid=true]:border-red-500"
          />

          {message != null && (
            <p id={errorId} role="alert" className="text-center text-sm text-red-600">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
