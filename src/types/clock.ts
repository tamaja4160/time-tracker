/**
 * Time provider interface. The pure domain layer never calls `Date.now()`
 * directly; wall-clock time is injected via `Clock` so it can be faked in
 * tests. See design "Layering" and "Infrastructure layer".
 */
export interface Clock {
  /** Current wall-clock time as epoch milliseconds. */
  now(): number;
}
