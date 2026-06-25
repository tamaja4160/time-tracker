# Implementation Plan: Time Tracker (pomodoro-timer)

## Overview

This plan implements Time Tracker incrementally in **TypeScript + React + TailwindCSS**, with
**Vitest + fast-check (`@fast-check/vitest`)** for property-based testing. It follows the design's
layering: a pure domain core (TimerEngine, validation, ActivityLogService, CsvExporter, Sheets
mapping) covered by the 17 correctness properties, infrastructure adapters behind interfaces
(LogStore, Clock, AuthClient, GoogleSheetsConnector), **client-only Google OAuth (Option A, no
backend)** using Google Identity Services in the browser, and a thin React UI wired over the domain.

**Auth approach: Option A (client-only, no hosting cost).** Per the user's decision, there is no
backend/BFF. Google authorization uses the browser token model (Google Identity Services
`initTokenClient`). The documented tradeoff applies: the connection lasts only about one hour of
access-token lifetime and may require periodic re-consent, so Requirements 11.3/11.4/11.7
(persistence across restarts, automatic renewal) are satisfied on a best-effort basis only, behind
the same `AuthClient`/`GoogleSheetsConnector` interfaces.

Each property-based test runs a **minimum of 100 iterations** (`{ numRuns: 100 }`) and is tagged
`// Feature: pomodoro-timer, Property {number}: {property_text}`. Tasks build on each other and end
with full UI wiring; no orphaned code.

## Tasks

- [x] 1. Scaffold project, tooling, and shared domain types
  - [x] 1.1 Initialize the React + TypeScript + TailwindCSS project with Vitest and fast-check
    - Create a Vite React+TS project; install and configure TailwindCSS (PostCSS + base styles) and semantic HTML conventions
    - Install and configure `vitest`, `@fast-check/vitest`, `fast-check`, and React Testing Library; add a `vitest.config.ts` with jsdom environment and a `test` script
    - Establish directory structure: `src/domain/` (pure), `src/infra/` (adapters), `src/ui/` (React), and `src/types/` (no `server/` — Option A is client-only)
    - _Requirements: 1.1_

  - [x] 1.2 Define shared domain types and adapter interfaces
    - Create `src/types/` with `LogEntry`, `TimerStatus`, `TimerState`, `TargetSheet`, and a `Result<T>` discriminated type
    - Declare interfaces `TimerEngine`, `ActivityLogService`, `LogStore`, `Clock`, `AuthClient`, `GoogleSheetsConnector` as defined in the design (no implementations yet)
    - _Requirements: 1.2, 7.1, 9.1, 11.3, 12.3, 13.1_

- [x] 2. Implement the Validation module (pure)
  - [x] 2.1 Implement `parseDuration`, `validateDescription`, and `validateSheetName`
    - `parseDuration(input)`: accept iff a whole number of minutes in [1, 999]; reject otherwise
    - `validateDescription(input)`: trim, accept iff trimmed length in [1, 50]; reason `empty` or `too_long` on rejection; return trimmed value on success
    - `validateSheetName(input)`: trim, accept iff trimmed length in [1, 100]; reason `empty` or `too_long`
    - _Requirements: 2.1, 2.4, 2.6, 6.4, 6.5, 6.6, 12.5_

  - [x]* 2.2 Write property test for duration validation and invariant
    - **Property 1: For any input value, `parseDuration` accepts it iff it represents a whole number of minutes between 1 and 999 inclusive; and for any sequence of `setDuration` calls, the effective configured duration is always a whole number of minutes in [1, 999], with rejected inputs leaving the previous configured duration unchanged.**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.6**
    - Generators: integers in/outside [1, 999], floats, NaN, strings, null/undefined; min 100 iterations

  - [x]* 2.3 Write property test for activity description validation
    - **Property 8: For any string, `validateDescription` accepts it iff its length after trimming is between 1 and 50 inclusive; rejected strings report `empty` when trimmed value is empty and `too_long` when trimmed length exceeds 50; accepted strings yield the trimmed value.**
    - **Validates: Requirements 6.4, 6.5, 6.6**
    - Generators: arbitrary unicode, whitespace-padded, all-whitespace, and over-length strings; min 100 iterations

  - [x]* 2.4 Write property test for sheet-name validation
    - **Property 16: For any string, `validateSheetName` accepts it iff its length after trimming is between 1 and 100 inclusive.**
    - **Validates: Requirements 12.5**
    - Min 100 iterations

- [x] 3. Implement the Clock provider and remaining-time display formatting
  - [x] 3.1 Implement `Clock` adapter and `formatRemaining`/`parseRemaining` helpers
    - `Clock` wraps `Date.now()`/wall-clock and date-time formatting; provide an in-memory fake for tests
    - `formatRemaining(seconds)`: seconds component `00`–`59` zero-padded, minutes zero-padded to at least two digits; `parseRemaining` is its inverse
    - _Requirements: 1.3, 1.4_

  - [x]* 3.2 Write property test for remaining-time display formatting
    - **Property 10: For any non-negative remaining-seconds value, the formatted display has the seconds component in range 00–59 zero-padded to two digits and the minutes component zero-padded to at least two digits, and parsing the formatted string back yields the original whole-second value.**
    - **Validates: Requirements 1.3**
    - Min 100 iterations

- [x] 4. Implement the TimerEngine state machine (pure)
  - [x] 4.1 Implement `init`, `setDuration`, and `reset`
    - `init(configuredDurationSec)`: idle state with `remainingSec` equal to configured duration; track `usingDefaultFallback`
    - `setDuration`: validate via Validation module; reject invalid, retaining previous (or Default_Duration 15 min if previous invalid/unset)
    - `reset`: stop, set remaining equal to configured duration, enter not-running state, create no log entry
    - _Requirements: 1.2, 2.2, 2.3, 2.5, 5.1, 5.2, 5.3_

  - [x]* 4.2 Write property test for idle remaining equals configured duration
    - **Property 2: For any valid configured duration, while no session is running (idle state) the timer's remaining time equals the configured duration.**
    - **Validates: Requirements 1.2, 2.3**
    - Min 100 iterations

  - [x]* 4.3 Write property test for reset transition
    - **Property 7: For any timer state, resetting transitions to the not-running state with remaining time equal to the configured duration, produces no log entry, and subsequent ticks do not change remaining time or status until a new session is started.**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - Min 100 iterations

  - [x] 4.4 Implement `start`, `tick`, and completion handling
    - `start`: from idle, transition to running with `endEpochMs`/`sessionStartEpochMs` set, remaining equal to configured duration
    - `tick(state, nowMs)`: recompute `remainingSec = max(0, ceil((endEpochMs - nowMs)/1000))`; on reaching 0 transition to completed, set remaining 0, record `sessionEndEpochMs` and a session-ended flag
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 6.3_

  - [x]* 4.5 Write property test for start transition
    - **Property 3: For any idle timer with a valid configured duration, starting a session transitions to the running state with remaining time equal to the configured duration.**
    - **Validates: Requirements 3.1**
    - Min 100 iterations

  - [x]* 4.6 Write property test for tick correctness (wall-clock countdown)
    - **Property 4: For any running session with configured duration D and any elapsed wall-clock time t since start, `tick` sets remaining time to clamp(D − t, 0, D) within 1 second, remaining time is non-increasing as t increases, and once t ≥ D the timer is completed with remaining time 0 and an end timestamp recorded.**
    - **Validates: Requirements 3.3, 3.4, 3.5, 6.3**
    - Generators: arbitrary start epochs and non-negative elapsed durations; min 100 iterations

  - [x] 4.7 Implement `pause` and `resume` with not-applicable results
    - `pause`: from running, capture remaining time, stop decrementing; `resume`: from paused, continue from captured remaining with no loss/addition
    - Invalid transitions (start while running, pause while not running, resume while not paused) return state unchanged with a not-applicable / already-running reason
    - _Requirements: 3.2, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x]* 4.8 Write property test for pause/resume preserving remaining time
    - **Property 5: For any running session, pausing captures the current remaining time; for any amount of elapsed time while paused, ticking leaves the remaining time unchanged; and resuming continues from exactly the captured remaining time with no time lost or added.**
    - **Validates: Requirements 4.2, 4.3, 4.4**
    - Min 100 iterations

  - [x]* 4.9 Write property test for invalid transitions are no-ops
    - **Property 6: For any timer state, an action not applicable to that state (start while running, pause while not running, resume while not paused) returns an equivalent state with remaining time and status unchanged, accompanied by a not-applicable indication.**
    - **Validates: Requirements 3.2, 4.5, 4.6**
    - Min 100 iterations

- [x] 5. Checkpoint - Ensure all timer/validation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement ActivityLogService and Log_Entry creation (pure)
  - [x] 6.1 Implement log entry construction from session instants
    - Build a `LogEntry` from session start/end instants and a validated description: `date` as `YYYY-MM-DD` of start, `startTime`/`endTime` as 24-hour `HH:MM:SS`, stable uuid `id`, and `startEpochMs`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x]* 6.2 Write property test for clock-time field formatting
    - **Property 9: For any session start and end instants, the created log entry's `date` is the YYYY-MM-DD representation of the start instant and `startTime`/`endTime` are the HH:MM:SS 24-hour representations of the start and end instants respectively.**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Min 100 iterations

  - [x] 6.3 Implement `append` and `orderedForDisplay`
    - `append`: pure, returns a new array preserving all prior entries unchanged plus the new entry (append-only)
    - `orderedForDisplay`: sort most-recent-first by `startEpochMs` with no entry added or dropped
    - _Requirements: 7.4, 8.1_

  - [x]* 6.4 Write property test for append and ordering preserve all entries, newest first
    - **Property 11: For any activity log and any new entry, appending yields a log containing every prior entry unchanged plus the new entry; and for any activity log, display ordering returns all entries sorted most recent to oldest by start time with no entry added or dropped.**
    - **Validates: Requirements 7.4, 8.1**
    - Min 100 iterations

- [x] 7. Implement the LogStore (localStorage adapter)
  - [x] 7.1 Implement `save`/`load` with versioned JSON schema and failure results
    - Serialize under key `timeTracker.activityLog` with `{ version, entries }`; `load` returns empty log when missing (Req 9.3), a load-failure result without overwriting raw value when unparseable (Req 9.4), and a save-failure result on write errors (Req 9.5)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 7.2 Write property test for log persistence round-trip
    - **Property 12: For any activity log, saving it to the Log_Store and then loading it back yields a log that matches the original field-by-field and preserves record count and order.**
    - **Validates: Requirements 9.1, 9.2, 9.5**
    - Use an in-memory localStorage fake; min 100 iterations

  - [x]* 7.3 Write unit tests for LogStore failure and empty paths
    - Empty store loads as empty log (Req 9.3); corrupt value yields retrieval-failure result and does not overwrite raw stored value (Req 9.4); injected write failure yields save-failure result (Req 9.5)
    - _Requirements: 9.3, 9.4, 9.5_

- [x] 8. Implement the CsvExporter (pure)
  - [x] 8.1 Implement `toCsv` and `parseCsv` with RFC 4180 escaping
    - Columns in order `date, start time, end time, description`; header row first; `\r\n` terminator; quote/escape fields containing comma, double quote, or CR/LF; empty log yields header-only CSV (Req 10.5)
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

  - [x]* 8.2 Write property test for CSV round-trip
    - **Property 13: For any activity log — including descriptions containing commas, double quotes, and line breaks — exporting to CSV and parsing it back produces log entries matching the original field-by-field and preserving record count and order.**
    - **Validates: Requirements 10.3, 10.4**
    - Generators: adversarial descriptions with commas, quotes, `\r\n`; min 100 iterations

  - [x]* 8.3 Write property test for CSV structure and formatting
    - **Property 14: For any activity log, the produced CSV has the four-column header row (date, start time, end time, description) as its first record, contains exactly one data record per log entry, and renders dates as YYYY-MM-DD and times as HH:MM:SS.**
    - **Validates: Requirements 10.1, 10.2**
    - Min 100 iterations

  - [x]* 8.4 Write unit test for empty-log CSV
    - Empty log exports as a header-only CSV naming all four columns
    - _Requirements: 10.5_

- [x] 9. Implement Google Sheets domain mapping (pure)
  - [x] 9.1 Implement column validation and log-entry-to-row mapping
    - `validateHeaderColumns(header)`: accept iff all four required columns present; otherwise report the exact set of missing columns
    - `toSheetRow(entry)`: return `[date, startTime, endTime, description]` with date/times in 24-hour format
    - _Requirements: 12.4, 13.1_

  - [x]* 9.2 Write property test for missing-column detection
    - **Property 15: For any existing-sheet header row, column validation accepts it iff it contains all four required columns; when one or more are missing it reports exactly the set of missing required columns and rejects the sheet.**
    - **Validates: Requirements 12.4**
    - Generators: permutations/subsets of required + extra columns; min 100 iterations

  - [x]* 9.3 Write property test for log entry to spreadsheet row mapping
    - **Property 17: For any log entry, the spreadsheet row produced for it is the array [date, startTime, endTime, description] in that order, with date and times in 24-hour format.**
    - **Validates: Requirements 13.1**
    - Min 100 iterations

- [x] 10. Checkpoint - Ensure all domain-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement client-only Google authorization (Option A, no backend)
  - [x] 11.1 Implement the browser OAuth token flow via Google Identity Services
    - Use GIS `initTokenClient` to request an access token with scopes `https://www.googleapis.com/auth/spreadsheets` plus `drive.file` for sheet creation; trigger consent on connect
    - Cache only the non-secret access token and its `expiresAtMs` in memory (and optional `localStorage` for same-session reuse); no refresh token exists in this model
    - Handle consent denial / no response within 120 s with a cause-specific error and a retry affordance (Req 11.6); on sign-out, discard the cached token (Req 11.5)
    - Document the ~1-hour limitation: reuse across restarts (11.3) and automatic renewal (11.4) are best-effort via silent re-grant while the Google session allows it; when the token is expired and cannot be silently renewed, prompt re-authorization (11.7)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x]* 11.2 Write integration tests for the client-only auth flow (mocked GIS token client)
    - Consent launch (11.1), access-token + expiry caching (11.2), reuse while unexpired without re-prompt (11.3), expiry triggers re-consent prompt (11.4, 11.7), sign-out clears cached token and forces re-auth (11.5), denial/timeout handling (11.6)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [x] 12. Implement browser-side Google adapters behind interfaces
  - [x] 12.1 Implement `AuthClient` and browser auth-metadata store (Auth_Store)
    - `getStatus`/`connect`/`signOut` wrap the GIS token client from Task 11.1; persist only non-secret metadata (`connected`, `expiresAtMs`, `targetSheetId`); surface auth-store save/retrieve failures (Req 11.8)
    - Document the Option A one-hour limitation in the interface and surface it to the UI
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8_

  - [x] 12.2 Implement `GoogleSheetsConnector` against the Google Sheets REST API (client-side)
    - Call the Sheets/Drive REST APIs directly from the browser using the cached access token: `createSheet` (header row in required order), `selectSheet` (validates columns via domain mapping), `appendRow`; write guards for missing auth (13.2) and missing target sheet (13.3); write-failure retention (13.4) and retry-up-to-3/escalation (13.5)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x]* 12.3 Write integration tests for Sheets operations (mocked Sheets API)
    - Create sheet with header row (12.2), accept existing sheet with required columns (12.3), guard writes without auth/target (13.2, 13.3), append row within latency budget (13.1), write retry + escalation (13.4, 13.5)
    - _Requirements: 12.2, 12.3, 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 13. Build React UI components over the domain
  - [x] 13.1 Implement `TimerScreen` shell with the timer reducer and tick interval
    - Drive `TimerState` with a reducer over `TimerEngine`; run a 250 ms `setInterval` calling `tick`; render timer as primary content on load
    - _Requirements: 1.1, 1.4, 3.3_

  - [x] 13.2 Implement `DurationInput` and `TimerDisplay`
    - `DurationInput` disabled while running; reject invalid input inline keeping prior duration (Req 2.4); `TimerDisplay` renders MM:SS via `formatRemaining` with a visible default-fallback badge (Req 1.5, 2.5)
    - _Requirements: 1.2, 1.3, 1.5, 2.1, 2.4, 2.5_

  - [x] 13.3 Implement `TimerControls`
    - Start / Pause / Resume / Reset buttons mapped to engine actions; reset hidden/disabled when idle or completed (Req 5.4); reset shows full-duration confirmation (Req 5.5); not-applicable/already-running indications surfaced (Req 3.2, 4.5, 4.6)
    - _Requirements: 3.2, 4.1, 4.5, 4.6, 5.1, 5.4, 5.5_

  - [x] 13.4 Implement `ActivityPrompt` modal
    - Shown on completion within 1 second with exact copy "What did you do (1 or 2 words)?"; input accepts 1–50 chars; on invalid submit retain entered text and show validation message; timer stays at zero until a new session starts
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 13.5 Implement `ActivityLogView`
    - Render entries most-recent-first via `orderedForDisplay`; empty-state indication when zero entries; live update on append within 1 second; retry display update up to 3 times then show error preserving data (Req 8.3, 8.4, 8.5)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 13.6 Implement `ExportBar` and `GoogleSheetsPanel`
    - `ExportBar`: trigger CSV download, show success confirmation (10.6) and export-failed error leaving log unchanged (10.7)
    - `GoogleSheetsPanel`: connect/sign-out, new-sheet prompt defaulting to "Time Tracker" with live name validation (12.1, 12.5), select existing sheet with missing-column errors (12.4), write status and re-auth prompts (11.6, 11.7, 13.2, 13.3)
    - _Requirements: 10.6, 10.7, 11.6, 11.7, 12.1, 12.4, 12.5, 12.6, 13.2, 13.3_

- [x] 14. Wire the application together
  - [x] 14.1 Implement `App` bootstrap and end-to-end wiring
    - On mount, load persisted log from `LogStore` (Req 9.2) and auth status from `AuthClient` (Req 11.3), render `TimerScreen`, `ActivityLogView`, `ExportBar`, `GoogleSheetsPanel`
    - On valid description submit: create `LogEntry`, append via service, persist via `LogStore`, update the displayed log; retain description on append/persist failure (Req 7.5)
    - Add a shared `ErrorBanner`/toast region for transient and persistent (Req 13.5) error messages
    - _Requirements: 1.1, 7.4, 7.5, 8.3, 9.1, 9.2, 11.3_

  - [x]* 14.2 Write component/DOM tests with fake timers
    - Timer present on initial render (1.1), 1-second display updates (1.4), pause/reset responsiveness (4.1, 5.1), live log update on append (8.3)
    - _Requirements: 1.1, 1.4, 4.1, 5.1, 8.3_

  - [x]* 14.3 Write unit tests for app-level error and default paths
    - Default duration 15 min when unset (2.2); fallback to 15:00 with indication (1.5, 2.5); append/persist retry + retention (7.5, 8.4, 8.5); auth-store failure handling (11.8)
    - _Requirements: 1.5, 2.2, 2.5, 7.5, 8.4, 8.5, 11.8_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP, but each maps to specific requirements/properties for traceability.
- All 17 correctness properties are implemented as single fast-check property tests with `{ numRuns: 100 }` (minimum) and tagged `// Feature: pomodoro-timer, Property {number}: {property_text}`.
- Google auth/Sheets uses the **client-only Option A** (no backend, no hosting cost) per the user's decision: Google Identity Services issues a short-lived access token in the browser, and the Sheets REST API is called directly. The documented tradeoff is that the connection lasts ~1 hour and may need periodic re-consent, so Requirements 11.3/11.4/11.7 are best-effort. The `AuthClient`/`GoogleSheetsConnector` interfaces keep a future backend (Option B) swappable without touching the domain or UI.
- Checkpoints provide incremental validation between layers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "7.1", "8.1", "9.1", "11.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.2", "7.2", "7.3", "8.2", "8.3", "8.4", "9.2", "9.3", "11.2", "12.1"] },
    { "id": 4, "tasks": ["4.1", "6.1", "12.2"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "6.2", "6.3", "12.3"] },
    { "id": 6, "tasks": ["4.5", "4.6", "4.7", "6.4"] },
    { "id": 7, "tasks": ["4.8", "4.9", "13.1"] },
    { "id": 8, "tasks": ["13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 9, "tasks": ["14.1"] },
    { "id": 10, "tasks": ["14.2", "14.3"] }
  ]
}
```
