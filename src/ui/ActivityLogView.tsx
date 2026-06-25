/**
 * `ActivityLogView` (UI layer) — task 13.5.
 *
 * Presentational, props-driven view of the Activity_Log. Renders every
 * {@link LogEntry} it is given as a semantic table, ordered most-recent-first
 * via the pure {@link orderedForDisplay} helper (Req 8.1). The component holds
 * no internal copy of the entries: it derives its rendered rows directly from
 * the `entries` prop on every render, so when the parent appends an entry and
 * passes a new array the table re-renders with it (Req 8.3). No caching or
 * memoized snapshot is kept that could block such updates.
 *
 * When the log is empty it shows an explicit empty-state message indicating no
 * entries have been logged (Req 8.2).
 *
 * Display-update failures are surfaced via the optional `error` prop. When set,
 * the component shows an error indication that the log could not be updated
 * WHILE still rendering whatever entries it currently has (Req 8.4, 8.5) — the
 * previously displayed data is never dropped to show the error. The retry logic
 * (up to three attempts) lives in the parent/wiring (task 14.1); this component
 * only reflects the latest `entries` and `error` props it receives.
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
 */
import type { LogEntry } from '../types';
import { orderedForDisplay } from '../domain/activityLog';

export interface ActivityLogViewProps {
  /** The current Activity_Log. Rendered most-recent-first; never mutated. */
  entries: LogEntry[];
  /**
   * Optional display-update error. When set (non-empty), an error indication is
   * shown alongside the existing entries without dropping displayed data
   * (Req 8.4, 8.5).
   */
  error?: string | null;
}

/**
 * Renders the Activity_Log as an accessible table, with empty-state and a
 * non-destructive error indication.
 */
export function ActivityLogView({ entries, error }: ActivityLogViewProps) {
  const rows = orderedForDisplay(entries);
  const hasEntries = rows.length > 0;

  return (
    <section
      aria-label="Activity log"
      className="flex flex-col gap-4 rounded-4xl border border-black/5 bg-white p-6 shadow-card sm:p-7"
    >
      <h2 className="text-lg font-semibold tracking-tight text-ink">Activity log</h2>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          {/* Surface the failure but keep existing entries visible (Req 8.4, 8.5). */}
          The activity log could not be updated. Showing the last known entries.
        </p>
      )}

      {hasEntries ? (
        <div className="overflow-hidden rounded-2xl border border-black/5">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-canvas text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Date
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Start
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  End
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-t border-black/5 transition-colors hover:bg-canvas/60"
                >
                  <td className="px-4 py-2.5 font-mono tabular-nums text-ink-soft">
                    {entry.date}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-ink-soft">
                    {entry.startTime}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-ink-soft">
                    {entry.endTime}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/10 bg-canvas/50 px-6 py-10 text-center">
          <span aria-hidden className="text-2xl">📝</span>
          <p role="status" className="text-sm text-ink-muted">
            No activity has been logged yet.
          </p>
        </div>
      )}
    </section>
  );
}
