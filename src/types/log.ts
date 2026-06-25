/**
 * Activity log domain types and the ActivityLogService / LogStore interfaces.
 * See design "Components and Interfaces > ActivityLogService and LogStore".
 */
import type { Result } from './result';

export interface LogEntry {
  id: string; // stable unique id (uuid)
  date: string; // YYYY-MM-DD (session start date)
  startTime: string; // HH:MM:SS 24-hour
  endTime: string; // HH:MM:SS 24-hour
  description: string; // trimmed, 1..50 chars
  startEpochMs: number; // used for deterministic most-recent-first ordering
}

export interface ActivityLogService {
  append(log: LogEntry[], entry: LogEntry): LogEntry[]; // pure: returns new array
  orderedForDisplay(log: LogEntry[]): LogEntry[]; // most-recent-first by startEpochMs
}

export interface LogStore {
  load(): Result<LogEntry[]>; // Req 9.2-9.4
  save(log: LogEntry[]): Result<void>; // Req 9.1, 9.5
}
