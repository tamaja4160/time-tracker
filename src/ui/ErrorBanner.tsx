/**
 * `ErrorBanner` (UI layer) — task 14.1.
 *
 * A small shared banner/toast region that renders app-level error messages
 * surfaced from any source (log retrieval/persistence, auth-store failures,
 * Google Sheets errors). It is purely presentational: the parent (`App`) owns
 * the list of active errors and the dismiss handler.
 *
 * Each message is rendered as an assertive `alert` so assistive technologies
 * announce it. Messages persist until the user dismisses them (Req 13.5 — a
 * persistent error notification that does not auto-dismiss), which also covers
 * transient errors the user can clear manually.
 *
 * _Requirements: 13.5 (persistent notifications); shared error surface for
 * Req 7.5, 9.4, 9.5, 11.8 messages routed by `App`._
 */

/** A single active error message with a stable id for keying/dismissal. */
export interface AppError {
  id: string;
  message: string;
}

export interface ErrorBannerProps {
  /** The currently active error messages. Rendered newest-first by the parent. */
  errors: AppError[];
  /** Dismiss a single error by id. */
  onDismiss: (id: string) => void;
}

/**
 * Render the active app-level errors as a dismissible banner region. Renders
 * nothing when there are no errors.
 */
export function ErrorBanner({ errors, onDismiss }: ErrorBannerProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Notifications"
      className="flex flex-col gap-2 px-6 pt-4"
    >
      {errors.map((error) => (
        <div
          key={error.id}
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800"
        >
          <span>{error.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(error.id)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded px-2 font-medium text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
