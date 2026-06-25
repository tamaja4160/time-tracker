/**
 * CsvExporter (pure) — RFC 4180 serialization/parsing of the Activity_Log.
 * See design "Components and Interfaces > CsvExporter (pure)".
 *
 * Columns, in order: `date, start time, end time, description`.
 * - The header row is the first record.
 * - Line terminator is CRLF (`\r\n`).
 * - RFC 4180 escaping: any field containing a comma, a double quote, or a
 *   CR/LF is wrapped in double quotes and internal double quotes are doubled.
 * - An empty log yields a header-only CSV (Req 10.5).
 *
 * Requirements: 10.1, 10.2, 10.3, 10.5 (round-trip support for 10.4).
 *
 * ## Round-trip handling of `id` and `startEpochMs`
 *
 * A `LogEntry` has six fields (`id`, `date`, `startTime`, `endTime`,
 * `description`, `startEpochMs`) but the CSV only carries the four
 * CSV-represented fields (`date`, `startTime`, `endTime`, `description`).
 * To support a field-by-field round-trip (Req 10.4 / Property 13) on the
 * CSV-represented fields while still producing complete `LogEntry` records,
 * `parseCsv` reconstructs the two non-CSV fields *deterministically*:
 *
 * - `startEpochMs` is derived from `date` + `startTime` interpreted in the
 *   local time zone (the zone the design uses to format those fields). See
 *   {@link deriveStartEpochMs}.
 * - `id` is derived deterministically from the four CSV-represented fields.
 *   See {@link deriveId}.
 *
 * Both derivation helpers are exported so callers (and the round-trip
 * property test) can construct the matching expected `startEpochMs`/`id`
 * for a generated entry, guaranteeing an exact, deterministic round-trip on
 * all six fields when entries are built via the same derivation.
 */
import type { LogEntry } from '../types';

export interface CsvExporter {
  toCsv(log: LogEntry[]): string;
  parseCsv(csv: string): LogEntry[];
}

/** Column header labels, in left-to-right order (Req 10.1, 10.2). */
export const CSV_HEADER: readonly string[] = [
  'date',
  'start time',
  'end time',
  'description',
];

const CRLF = '\r\n';

/**
 * Escape a single field per RFC 4180. A field is quoted when it contains a
 * comma, a double quote, or a CR/LF; internal double quotes are doubled.
 */
function escapeField(value: string): string {
  const mustQuote =
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\r') ||
    value.includes('\n');
  if (!mustQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Serialize one record (array of fields) into an RFC 4180 line. */
function serializeRecord(fields: readonly string[]): string {
  return fields.map(escapeField).join(',');
}

/**
 * Deterministically derive `startEpochMs` from the CSV date + start time.
 * The fields are interpreted in the local time zone, matching how the design
 * formats `date` (YYYY-MM-DD) and `startTime` (HH:MM:SS) from the start
 * instant. Returns `NaN` if the inputs are not well-formed.
 */
export function deriveStartEpochMs(date: string, startTime: string): number {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(startTime);
  if (!dateMatch || !timeMatch) return Number.NaN;
  const [, y, mo, d] = dateMatch;
  const [, h, mi, s] = timeMatch;
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
    0,
  ).getTime();
}

/**
 * Deterministically derive a stable `id` from the four CSV-represented
 * fields. Using all four fields (rather than just date+startTime) keeps the
 * id stable across a round-trip and distinct for entries that differ in any
 * CSV-carried field. Implemented as a djb2 hash rendered as hex.
 */
export function deriveId(
  date: string,
  startTime: string,
  endTime: string,
  description: string,
): string {
  // Use a delimiter that cannot appear in date/time fields to reduce
  // accidental collisions between distinct field groupings.
  const material = [date, startTime, endTime, description].join('\u0000');
  let hash = 5381;
  for (let i = 0; i < material.length; i++) {
    // hash * 33 + charCode, kept within 32-bit unsigned range.
    hash = ((hash << 5) + hash + material.charCodeAt(i)) >>> 0;
  }
  return `csv-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Parse RFC 4180 CSV text into records (arrays of fields). Handles quoted
 * fields containing commas, doubled quotes, and CR/LF, and accepts CRLF, lone
 * LF, or lone CR as record terminators. A single trailing record terminator
 * does not produce an extra empty record.
 */
function parseRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];

    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      record.push(field);
      field = '';
    } else if (c === '\r' || c === '\n') {
      record.push(field);
      field = '';
      records.push(record);
      record = [];
      if (c === '\r' && csv[i + 1] === '\n') i++; // consume LF of a CRLF pair
    } else {
      field += c;
    }
  }

  // Flush the final field/record unless the input ended on a clean record
  // terminator (in which case `record` is empty and `field` is empty).
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

/**
 * Concrete CsvExporter implementation. Stateless; exported as a singleton for
 * convenience and also as the `CsvExporter` shape.
 */
export const csvExporter: CsvExporter = {
  toCsv(log: LogEntry[]): string {
    const lines: string[] = [serializeRecord(CSV_HEADER)];
    for (const entry of log) {
      lines.push(
        serializeRecord([
          entry.date,
          entry.startTime,
          entry.endTime,
          entry.description,
        ]),
      );
    }
    return lines.join(CRLF);
  },

  parseCsv(csv: string): LogEntry[] {
    const records = parseRecords(csv);
    // First record is the header row; data records follow.
    const dataRecords = records.slice(1);
    return dataRecords.map((fields) => {
      const date = fields[0] ?? '';
      const startTime = fields[1] ?? '';
      const endTime = fields[2] ?? '';
      const description = fields[3] ?? '';
      return {
        id: deriveId(date, startTime, endTime, description),
        date,
        startTime,
        endTime,
        description,
        startEpochMs: deriveStartEpochMs(date, startTime),
      };
    });
  },
};

export const toCsv = csvExporter.toCsv;
export const parseCsv = csvExporter.parseCsv;
