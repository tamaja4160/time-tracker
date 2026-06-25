/**
 * Pure remaining-time display formatting helpers (domain layer).
 *
 * These functions are framework-independent and must remain pure: no `Date`,
 * no DOM, no I/O. They format a non-negative whole-second remaining value as
 * `MM:SS` and parse that representation back to the original second count.
 *
 * Format conventions (see design "Time and format conventions"):
 * - The seconds component is always in the range `00`–`59`, zero-padded to two
 *   digits.
 * - The minutes component is the total whole minutes, zero-padded to a minimum
 *   of two digits. Minutes may exceed 99 for large durations (e.g. the maximum
 *   999-minute configured duration), in which case as many digits as needed are
 *   rendered.
 *
 * _Requirements: 1.3, 1.4_
 */

const SECONDS_PER_MINUTE = 60;

/**
 * Format a non-negative remaining-seconds value as `MM:SS`.
 *
 * @param seconds non-negative whole number of remaining seconds. Fractional
 *   values are truncated toward zero to the underlying whole second.
 * @returns the `MM:SS` string with a two-digit (or wider) zero-padded minutes
 *   component and a two-digit `00`–`59` zero-padded seconds component.
 */
export function formatRemaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(
      `formatRemaining expects a non-negative finite number, received: ${seconds}`,
    );
  }
  const whole = Math.trunc(seconds);
  const minutes = Math.trunc(whole / SECONDS_PER_MINUTE);
  const secs = whole % SECONDS_PER_MINUTE;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Parse a `MM:SS` string produced by {@link formatRemaining} back to its whole
 * remaining-seconds value. This is the exact inverse of `formatRemaining` for
 * any non-negative whole-second input.
 *
 * @param str a `MM:SS` formatted string.
 * @returns the total whole number of seconds.
 */
export function parseRemaining(str: string): number {
  const match = /^(\d+):(\d{2})$/.exec(str);
  if (match === null) {
    throw new SyntaxError(`parseRemaining expects "MM:SS" format, received: ${str}`);
  }
  const minutes = Number(match[1]);
  const secs = Number(match[2]);
  if (secs >= SECONDS_PER_MINUTE) {
    throw new RangeError(`parseRemaining seconds component out of range 00-59: ${str}`);
  }
  return minutes * SECONDS_PER_MINUTE + secs;
}
