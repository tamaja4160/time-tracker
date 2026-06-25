/**
 * Generic discriminated result type used to model domain errors as values
 * rather than thrown exceptions (see design "Error Handling").
 *
 * Success carries a `value`; failure carries an `error` describing the cause.
 * For operations that produce no value on success, use `Result<void>`.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
