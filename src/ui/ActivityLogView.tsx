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
    <section aria-label="Activity log" className="flex flex-col gap-3 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Activity log</h2>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {/* Surface the failure but keep existing entries visible (Req 8.4, 8.5). */}
          The activity log could not be updated. Showing the last known entries.
        </p>
      )}

      {hasEntries ? (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th scope="col" className="px-3 py-2 font-medium">
                Date
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Start
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                End
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id} className="border-b border-slate-100">
                <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                  {entry.date}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                  {entry.startTime}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                  {entry.endTime}
                </td>
                <td className="px-3 py-2 text-slate-900">{entry.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p role="status" className="text-sm text-slate-500">
          No activity has been logged yet.
        </p>
      )}
    </section>
  );
}
