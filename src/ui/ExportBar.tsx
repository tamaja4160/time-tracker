/**
 * `ExportBar` (UI layer) — task 13.6.
 *
 * Presentational control that exports the current Activity_Log as a CSV file
 * (Req 10.6, 10.7). The CSV bytes are produced by the pure {@link toCsv}
 * serializer; this component only handles the download side effect and the
 * success/failure messaging.
 *
 * On success it shows a confirmation that the export succeeded (Req 10.6). If
 * producing or delivering the file throws, it shows an export-failed error and
 * leaves the log untouched — this component never mutates `entries` (Req 10.7).
 *
 * The download mechanism is injectable via the optional `download` prop so the
 * component is testable under jsdom (where Blob URL download is not wired up).
 * The default implementation creates a Blob, an object URL, and clicks a
 * transient anchor — the standard browser file-download approach.
 *
 * _Requirements: 10.6, 10.7_
 */
import { useState } from 'react';
import type { LogEntry } from '../types';
import { toCsv } from '../domain/csvExporter';

/** Filename used for the exported CSV download. */
export const EXPORT_FILENAME = 'time-tracker-log.csv';

export interface ExportBarProps {
  /** The current Activity_Log to export. Never mutated by this component. */
  entries: LogEntry[];
  /**
   * Download side effect, injectable for tests. Defaults to a real browser
   * download (Blob + object URL + anchor click). Receives the target filename
   * and the already-serialized CSV text.
   */
  download?: (filename: string, csv: string) => void;
}

/** Outcome of the most recent export attempt, used to drive the message line. */
type ExportStatus =
  | { kind: 'idle' }
  | { kind: 'success' }
  | { kind: 'error' };

/**
 * Default browser download: wrap the CSV in a Blob, create an object URL, and
 * trigger a click on a transient anchor. Guarded so it degrades gracefully in
 * non-browser/jsdom environments rather than throwing for missing APIs.
 */
function defaultDownload(filename: string, csv: string): void {
  // Prepend a UTF-8 BOM so spreadsheet apps detect encoding correctly.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ExportBar({ entries, download = defaultDownload }: ExportBarProps) {
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' });

  function handleExport(): void {
    try {
      // Pure serialization first (Req 10.1-10.5); never mutates `entries`.
      const csv = toCsv(entries);
      download(EXPORT_FILENAME, csv);
      // File produced and made available — confirm success (Req 10.6).
      setStatus({ kind: 'success' });
    } catch {
      // Producing/delivering the file failed: show an error and leave the
      // Activity_Log unchanged (Req 10.7). `entries` is read-only here.
      setStatus({ kind: 'error' });
    }
  }

  return (
    <section
      aria-label="Export activity log"
      className="flex flex-col items-start gap-2"
    >
      <button
        type="button"
        onClick={handleExport}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
      >
        Export CSV
      </button>

      {status.kind === 'success' && (
        <p role="status" aria-live="polite" className="text-sm text-emerald-700">
          Export succeeded. Your CSV file has been downloaded.
        </p>
      )}

      {status.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          Export failed. Your activity log was not changed — please try again.
        </p>
      )}
    </section>
  );
}
