/**
 * Validation module (pure).
 *
 * Framework-independent validation helpers for the Time Tracker domain. No DOM,
 * no `Date`, no network. Return shapes match the design's "Validation module
 * (pure)" section exactly.
 *
 * - `parseDuration`  — duration in whole minutes, 1..999 (Req 2.1, 2.4, 2.6)
 * - `validateDescription` — activity description, 1..50 chars after trim (Req 6.4-6.6)
 * - `validateSheetName`    — sheet name, 1..100 chars after trim (Req 12.5)
 */

/** Result of validating a duration input. */
export type DurationResult = { ok: true; minutes: number } | { ok: false };

/** Result of validating a text field with length bounds. */
export type TextResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' };

const DURATION_MIN_MINUTES = 1;
const DURATION_MAX_MINUTES = 999;
const DESCRIPTION_MAX_LENGTH = 50;
const SHEET_NAME_MAX_LENGTH = 100;

/**
 * Accepts `input` if and only if it represents a whole number of minutes in
 * [1, 999] inclusive. Accepts a number that is an integer in range, or a string
 * whose trimmed form is a base-10 whole number in range. Everything else —
 * non-integers, NaN, Infinity, floats, non-numeric strings, null, undefined,
 * out-of-range values — is rejected.
 */
export function parseDuration(input: unknown): DurationResult {
  let value: number;

  if (typeof input === 'number') {
    value = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    // Reject empty strings and anything that is not a plain whole number.
    // `/^[+-]?\d+$/` excludes floats, exponents, whitespace-only, and garbage.
    if (!/^[+-]?\d+$/.test(trimmed)) {
      return { ok: false };
    }
    value = Number(trimmed);
  } else {
    return { ok: false };
  }

  if (!Number.isInteger(value)) {
    return { ok: false };
  }
  if (value < DURATION_MIN_MINUTES || value > DURATION_MAX_MINUTES) {
    return { ok: false };
  }
  return { ok: true, minutes: value };
}

/**
 * Trims `input` and accepts it if and only if the trimmed length is in [1, 50].
 * On rejection reports `empty` when the trimmed value is empty, otherwise
 * `too_long`. On success returns the trimmed value.
 */
export function validateDescription(input: string): TextResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }
  return { ok: true, value: trimmed };
}

/**
 * Trims `input` and accepts it if and only if the trimmed length is in [1, 100].
 * On rejection reports `empty` when the trimmed value is empty, otherwise
 * `too_long`. On success returns the trimmed value.
 */
export function validateSheetName(input: string): TextResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (trimmed.length > SHEET_NAME_MAX_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }
  return { ok: true, value: trimmed };
}
