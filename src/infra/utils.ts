/**
 * Shared infrastructure utilities used across multiple infra modules.
 */
import type { StorageLike } from './storageLike';

/**
 * Return a human-readable description of an unknown thrown value.
 * Used in catch blocks where the error type is unknown.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err === undefined || err === null) return '';
  return String(err);
}

/**
 * Resolve a `StorageLike` option to a concrete instance or `null`.
 * - Passing `null` explicitly disables persistence.
 * - Passing a `StorageLike` uses it directly (e.g. a test fake).
 * - Passing `undefined` falls back to `window.localStorage` when available.
 */
export function resolveStorage(
  option: StorageLike | null | undefined,
): StorageLike | null {
  if (option === null) return null;
  if (option) return option;
  if (typeof window !== 'undefined') {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
  return null;
}
