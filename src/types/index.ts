/**
 * Barrel for shared domain types and adapter interfaces (task 1.2).
 */
export type { Result } from './result';
export type { TimerStatus, TimerState, TimerEngine } from './timer';
export type { LogEntry, ActivityLogService, LogStore } from './log';
export type { Clock } from './clock';
export type { AuthClient, GoogleSheetsConnector, TargetSheet } from './google';
