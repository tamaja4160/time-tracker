# Requirements Document

## Introduction

Time Tracker is a web-accessible application that helps users time focused work sessions and keep a log of what they accomplished. The main screen presents a countdown timer that defaults to 15 minutes and can be adjusted by the user. The user can pause and resume a running session or reset it. When a session reaches zero, the application prompts the user to briefly describe what they did, then records a log entry capturing the date, start time, end time, and description. Users can export their accumulated log as a CSV file, or sign in to Google to write entries directly into a Google Sheet (creating a new sheet or appending to an existing one).

The application targets a TypeScript and React implementation using TailwindCSS and semantic HTML. The Activity_Log is append-only and persists in the browser's local storage on the user's current device and browser. Sign-in is required only for the Google Sheets feature; once the user signs in, the authorization is stored and reused across browser sessions and restarts for as long as it remains valid, so the user stays connected without repeatedly signing in.

## Glossary

- **Time_Tracker_App**: The complete web application that provides timing, logging, and export capabilities.
- **Timer**: The component that displays and counts down a configured duration.
- **Session**: A single timed period from the moment the Timer is started until it reaches zero, or until it is reset.
- **Default_Duration**: The pre-set Session length of 15 minutes (900 seconds) applied when the user has not selected a different duration.
- **Configured_Duration**: The Session length currently selected by the user, defaulting to the Default_Duration.
- **Activity_Description**: The text a user enters describing what they did during a completed Session, limited to a short phrase of 1 to 50 characters.
- **Log_Entry**: A record containing the Session date, start time, end time, and Activity_Description.
- **Activity_Log**: The append-only, ordered collection of all Log_Entry records.
- **Log_Store**: The browser local-storage mechanism that retains the Activity_Log on the user's current device and browser across page loads.
- **CSV_Exporter**: The component that serializes the Activity_Log into a CSV-formatted file for download.
- **Google_Sheets_Connector**: The component that authenticates the user to Google and writes Log_Entry records to a Google Sheet.
- **Google_Authorization**: The credentials (including any renewable/refresh credential) that permit the Google_Sheets_Connector to access the user's Google Sheets on the user's behalf.
- **Auth_Store**: The browser-local persistence mechanism that retains the Google_Authorization across page loads and browser restarts on the user's current device and browser.
- **Target_Sheet**: The Google Sheet that the Google_Sheets_Connector writes to, either newly created or an existing sheet selected by the user.
- **User**: A person interacting with the Time_Tracker_App through a web browser.

## Requirements

### Requirement 1: Display the Timer as the Main Screen

**User Story:** As a user, I want a timer to be the first thing I see, so that I can start a focus session immediately.

#### Acceptance Criteria

1. WHEN the Time_Tracker_App is loaded, THE Time_Tracker_App SHALL display the Timer as the primary content of the main screen within 2 seconds, without requiring User navigation.
2. WHILE no Session is running, THE Timer SHALL show the Configured_Duration as the remaining time.
3. THE Timer SHALL display the remaining time in MM:SS format, where MM is the minutes from 00 to 99 and SS is the seconds from 00 to 59, each zero-padded to two digits.
4. WHILE a Session is running, THE Timer SHALL update the displayed remaining time at a 1-second interval.
5. IF the Configured_Duration is unavailable when the Timer is displayed AND the resulting fallback duration differs from the Default_Duration, THEN THE Timer SHALL display the Default_Duration of 15:00 and SHALL present a visible indication that the default duration is in use.

### Requirement 2: Adjust the Timer Duration

**User Story:** As a user, I want to change the timer length, so that I can run focus sessions that fit my task.

#### Acceptance Criteria

1. WHILE the Timer is displayed and no Session is running, THE Time_Tracker_App SHALL allow the User to set the Configured_Duration to a whole number of minutes between 1 and 999 inclusive.
2. IF the User has not set a Configured_Duration, THEN THE Time_Tracker_App SHALL use the Default_Duration of 15 minutes.
3. WHEN the User sets a valid Configured_Duration, THE Timer SHALL display the new Configured_Duration as the remaining time within 1 second.
4. IF the User sets a Configured_Duration that is not a whole number of minutes between 1 and 999 inclusive, THEN THE Time_Tracker_App SHALL reject the value, retain the previous Configured_Duration, and display an error indication that the entered value is invalid.
5. IF the previous Configured_Duration is also invalid or unset, THEN THE Time_Tracker_App SHALL use the Default_Duration of 15 minutes.
6. THE Time_Tracker_App SHALL ensure that the effective Configured_Duration is always a whole number of minutes between 1 and 999 inclusive, regardless of how the value was provided.

### Requirement 3: Start the Countdown

**User Story:** As a user, I want to start the timer, so that my focus session begins.

#### Acceptance Criteria

1. WHEN the User activates the Timer and no Session is running, THE Timer SHALL begin a new Session and start counting down from the Configured_Duration.
2. IF the User activates the Timer while a Session is already running, THEN THE Timer SHALL ignore the activation, leave the running Session unchanged, and present an indication that a Session is already in progress.
3. WHILE a Session is running, THE Timer SHALL decrement the displayed remaining time by exactly 1 second at an interval of 1000 milliseconds, with the displayed value drifting no more than 1 second from true elapsed wall-clock time.
4. WHILE a Session is running, THE Timer SHALL continue counting down without requiring further User input until the remaining time reaches 0 seconds.
5. WHEN the remaining time reaches 0 seconds, THE Timer SHALL set the displayed remaining time to 0 seconds, end the running Session, and set an explicit session-ended flag indicating the Session has completed.

### Requirement 4: Pause and Resume a Session

**User Story:** As a user, I want to pause and resume the timer, so that I can handle interruptions without losing my session.

#### Acceptance Criteria

1. WHEN the User pauses a running Session, THE Timer SHALL stop decrementing the remaining time within 200 milliseconds.
2. WHEN the User pauses a running Session, THE Timer SHALL retain the remaining time at the value held at the moment of pause, accurate to within 1 second.
3. WHEN the User resumes a paused Session, THE Timer SHALL resume decrementing from the retained remaining time within 200 milliseconds, with no loss or addition to the retained value.
4. WHILE a Session is paused, THE Timer SHALL display the retained remaining time in minutes and seconds, unchanged for the entire paused duration.
5. IF the User attempts to pause a Session that is not in the running state, THEN THE Timer SHALL retain the current remaining time and state unchanged and provide an indication that the pause action is not applicable.
6. IF the User attempts to resume a Session that is not in the paused state, THEN THE Timer SHALL retain the current remaining time and state unchanged and provide an indication that the resume action is not applicable.

### Requirement 5: Reset a Session

**User Story:** As a user, I want to reset the timer, so that I can cancel the current session and start over.

#### Acceptance Criteria

1. WHEN the User resets the Timer, THE Timer SHALL immediately stop counting down and set the remaining time equal to the Configured_Duration within 200 milliseconds.
2. WHEN the User resets a running or paused Session, THE Time_Tracker_App SHALL cancel that Session without creating a Log_Entry.
3. WHEN a Session is reset, THE Timer SHALL enter the not-running state and SHALL NOT resume counting until the User starts a new Session.
4. WHILE no Session is running or paused, THE Time_Tracker_App SHALL disable or hide the reset control so that there is nothing to reset.
5. WHEN a Session is reset, THE Time_Tracker_App SHALL display a visual confirmation that the Timer has returned to the not-running state showing the full Configured_Duration.

### Requirement 6: Complete a Session and Prompt for Activity

**User Story:** As a user, I want to be asked what I did when the timer finishes, so that I can record my accomplishment.

#### Acceptance Criteria

1. WHEN the Timer reaches zero, THE Time_Tracker_App SHALL display the activity prompt to the User within 1 second with the message "What did you do (1 or 2 words)?".
2. WHEN the activity prompt is displayed, THE Time_Tracker_App SHALL provide an input field that accepts an Activity_Description of 1 to 50 characters.
3. WHILE the activity prompt is displayed, THE Timer SHALL remain at zero until the User starts a new Session.
4. WHEN the User submits an Activity_Description containing 1 to 50 characters after leading and trailing whitespace is removed, THE Time_Tracker_App SHALL store the trimmed text as the description for the completed Session.
5. IF the User submits an Activity_Description that is empty or contains only whitespace after trimming, THEN THE Time_Tracker_App SHALL display a validation message indicating that a non-empty description is required AND SHALL retain the prompt with the previously entered text until a valid Activity_Description is provided.
6. IF the User submits an Activity_Description exceeding 50 characters after trimming, THEN THE Time_Tracker_App SHALL display a validation message indicating the 50-character maximum AND SHALL retain the prompt until a valid Activity_Description is provided.

### Requirement 7: Create a Log Entry

**User Story:** As a user, I want each completed session recorded with its details, so that I have a history of my work.

#### Acceptance Criteria

1. WHEN the User submits a valid Activity_Description, THE Time_Tracker_App SHALL create a Log_Entry containing the Session date, start time, end time, and the submitted Activity_Description within 1 second.
2. THE Time_Tracker_App SHALL record the start time as the clock time, in hours, minutes, and seconds, at which the Session began.
3. THE Time_Tracker_App SHALL record the end time as the clock time, in hours, minutes, and seconds, at which the Timer reached zero.
4. WHEN a Log_Entry is created, THE Time_Tracker_App SHALL append the Log_Entry to the Activity_Log as the most recent entry.
5. IF creating or appending a Log_Entry fails, THEN THE Time_Tracker_App SHALL display an error indication and SHALL retain the submitted Activity_Description so the User can retry.

### Requirement 8: View the Activity Log

**User Story:** As a user, I want to see my logged entries, so that I can review what I have done.

#### Acceptance Criteria

1. THE Time_Tracker_App SHALL display the Activity_Log showing, for each Log_Entry, the date, start time, end time, and Activity_Description, with Log_Entries ordered from most recent to oldest by start time.
2. WHILE the Activity_Log contains zero Log_Entries, THE Time_Tracker_App SHALL display an empty-state indication that no entries have been logged.
3. WHEN a new Log_Entry is appended, THE Time_Tracker_App SHALL update the displayed Activity_Log to include the new Log_Entry within 1 second of the append, regardless of whether the Activity_Log is currently visible to the User.
4. IF updating the displayed Activity_Log fails, THEN THE Time_Tracker_App SHALL retry the display update up to 3 times, retaining the previously displayed Log_Entries until a retry succeeds.
5. IF all 3 retry attempts to update the displayed Activity_Log fail, THEN THE Time_Tracker_App SHALL display an error indication that the Activity_Log could not be updated while preserving the existing Activity_Log data.

### Requirement 9: Persist the Activity Log

**User Story:** As a user, I want my log to remain available after I close the browser, so that I do not lose my history on this device.

#### Acceptance Criteria

1. WHEN a Log_Entry is appended to the Activity_Log, THE Time_Tracker_App SHALL save the complete Activity_Log to the Log_Store within 1 second of the append operation.
2. WHEN the Time_Tracker_App is loaded, THE Time_Tracker_App SHALL retrieve the Activity_Log from the Log_Store and display all retrieved Log_Entry records within 2 seconds, ordered from most recent to oldest.
3. IF the Log_Store contains no saved Activity_Log when the Time_Tracker_App is loaded, THEN THE Time_Tracker_App SHALL display an empty Activity_Log containing zero Log_Entry records.
4. IF retrieving the Activity_Log from the Log_Store fails, THEN THE Time_Tracker_App SHALL display an error message indicating that retrieval failed AND SHALL display an empty Activity_Log without discarding any Log_Entry records held in the Log_Store.
5. IF saving the Activity_Log to the Log_Store fails, THEN THE Time_Tracker_App SHALL display an error message indicating that the save failed AND SHALL retain the appended Log_Entry in the in-session Activity_Log.

### Requirement 10: Export the Activity Log as CSV

**User Story:** As a user, I want to export my log as a CSV file, so that I can use it in other tools.

#### Acceptance Criteria

1. WHEN the User requests a CSV export, THE CSV_Exporter SHALL produce a CSV file containing one row per Log_Entry with columns for date, start time, end time, and Activity_Description, where the date uses YYYY-MM-DD format and the start time and end time use 24-hour HH:MM:SS format.
2. WHEN the CSV file is produced, THE CSV_Exporter SHALL include, as the first row, a header row naming each column.
3. WHERE an Activity_Description contains a comma, a double quote, or a line break, THE CSV_Exporter SHALL escape the value according to RFC 4180.
4. FOR ALL Activity_Log contents, exporting to CSV and parsing the CSV back SHALL produce Log_Entry records that match the original Activity_Log field-by-field and preserve the original record count and order (round-trip property).
5. IF the Activity_Log contains no Log_Entry records, THEN THE CSV_Exporter SHALL produce a CSV file containing only the header row naming all four columns: date, start time, end time, and Activity_Description.
6. WHEN the CSV file has been produced and made available to the User, THE CSV_Exporter SHALL display a confirmation that the export succeeded.
7. IF producing the CSV file fails, THEN THE CSV_Exporter SHALL display an error indication that the export failed and SHALL leave the Activity_Log unchanged.

### Requirement 11: Connect to Google Sheets

**User Story:** As a user, I want to sign in and stay connected to Google Sheets, so that my log entries can be written into a spreadsheet I control without having to sign in again every time.

#### Acceptance Criteria

1. WHEN the User selects the option to connect to Google Sheets, THE Google_Sheets_Connector SHALL present a Google sign-in prompt requesting authorization to access Google Sheets within 3 seconds.
2. WHEN authorization is granted, THE Google_Sheets_Connector SHALL request the longest-lived, renewable Google_Authorization the User grants and SHALL save the Google_Authorization to the Auth_Store.
3. WHEN the Time_Tracker_App is loaded and a valid Google_Authorization exists in the Auth_Store, THE Google_Sheets_Connector SHALL reuse the stored Google_Authorization without prompting the User to sign in again.
4. WHILE a Google_Authorization is stored and renewable, THE Google_Sheets_Connector SHALL automatically renew the Google_Authorization before or upon its expiry so that the User remains connected for as long as the underlying Google credentials permit.
5. WHEN the User signs out, THE Google_Sheets_Connector SHALL discard the Google_Authorization from the Auth_Store and SHALL require a new sign-in before any further Google Sheets access.
6. IF authorization is denied, fails, or no authorization response is received within 120 seconds, THEN THE Google_Sheets_Connector SHALL display an error message indicating the cause of the failure, SHALL leave the Activity_Log unchanged, and SHALL allow the User to retry the connection.
7. IF the stored Google_Authorization expires or is revoked and cannot be automatically renewed, THEN THE Google_Sheets_Connector SHALL prompt the User to re-authorize before writing to the spreadsheet and SHALL leave the Activity_Log unchanged until re-authorization succeeds.
8. IF saving or retrieving the Google_Authorization from the Auth_Store fails, THEN THE Google_Sheets_Connector SHALL display an error message and SHALL allow the User to sign in again, without modifying the Activity_Log.

### Requirement 12: Choose the Target Sheet

**User Story:** As a user, I want to create a new sheet or pick an existing one, so that my entries go where I want them.

#### Acceptance Criteria

1. WHEN the User chooses to create a new sheet and a valid authorization exists, THE Google_Sheets_Connector SHALL prompt the User for a sheet name of 1 to 100 characters with a default value of "Time Tracker".
2. WHEN the User confirms creation of a new sheet with a valid name, THE Google_Sheets_Connector SHALL create the Target_Sheet with a header row containing the columns date, start time, end time, and Activity_Description in that left-to-right order.
3. WHEN the User chooses an existing sheet that contains all four columns date, start time, end time, and Activity_Description, THE Google_Sheets_Connector SHALL designate that sheet as the Target_Sheet.
4. IF the User chooses an existing sheet that does not contain all four required columns, THEN THE Google_Sheets_Connector SHALL display an error message indicating which required columns are missing and SHALL retain any previously designated Target_Sheet unchanged.
5. WHILE the User is entering a new sheet name in the prompt, THE Google_Sheets_Connector SHALL validate the entered name immediately as the User types, and IF the entered name is empty or exceeds 100 characters, THEN THE Google_Sheets_Connector SHALL display a validation message and SHALL retain the prompt until a valid name is provided.
6. IF the User chooses to create or select a sheet and no valid authorization exists, THEN THE Google_Sheets_Connector SHALL display an error message and SHALL prompt the User to sign in before designating a Target_Sheet.

### Requirement 13: Write Log Entries to Google Sheets

**User Story:** As a user, I want log entries written directly to my Google Sheet, so that my records stay in one place automatically.

#### Acceptance Criteria

1. WHEN the User requests that a Log_Entry be written and a valid authorization and Target_Sheet exist, THE Google_Sheets_Connector SHALL append, within 5 seconds, a single row to the Target_Sheet containing the date, start time, end time, and Activity_Description in that column order, where date and times use 24-hour format.
2. IF the User requests a Google Sheets write and no valid authorization exists, THEN THE Google_Sheets_Connector SHALL withhold the write and SHALL display a prompt instructing the User to sign in and connect before writing.
3. IF the User requests a Google Sheets write and no Target_Sheet has been designated, THEN THE Google_Sheets_Connector SHALL withhold the write and SHALL display a prompt instructing the User to create or choose a Target_Sheet before writing.
4. IF a Google Sheets write fails, THEN THE Google_Sheets_Connector SHALL display an error message indicating that the write to the Target_Sheet did not succeed and SHALL retain the unwritten Log_Entry in the Activity_Log without modification.
5. IF the error message cannot be displayed or the Activity_Log cannot be retained after a failed write, THEN THE Google_Sheets_Connector SHALL retry the action up to a maximum of 3 attempts at intervals of 2 seconds, and IF all retry attempts do not succeed, THEN THE Google_Sheets_Connector SHALL escalate the failure to the User by displaying a persistent error notification.
