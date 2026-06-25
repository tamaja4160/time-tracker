/**
 * Google integration interfaces. These remain backend-agnostic: the
 * client-only Option A implementation (Google Identity Services in the
 * browser + Sheets REST API) sits behind the same interfaces, keeping a
 * future backend (Option B) swappable without touching the domain or UI.
 * See design "Components and Interfaces > Google integration interfaces".
 */
import type { LogEntry } from './log';

export interface AuthClient {
  getStatus(): Promise<{ connected: boolean; expiresAtMs: number | null }>; // Req 11.3
  connect(): Promise<void>; // launches consent flow (Req 11.1-11.2)
  signOut(): Promise<void>; // Req 11.5
}

export interface GoogleSheetsConnector {
  createSheet(name: string): Promise<TargetSheet>; // Req 12.1-12.2
  selectSheet(sheetId: string): Promise<TargetSheet>; // Req 12.3-12.4 (validates columns)
  appendRow(target: TargetSheet, entry: LogEntry): Promise<void>; // Req 13.1
}

export interface TargetSheet {
  spreadsheetId: string;
  sheetTitle: string;
  hasRequiredColumns: boolean;
}
