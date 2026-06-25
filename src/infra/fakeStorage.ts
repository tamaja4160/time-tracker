/**
 * In-memory `Storage`-like fake for tests (and any non-browser environment).
 *
 * Implements the subset of the DOM `Storage` interface that {@link createLogStore}
 * depends on, so an isolated, deterministic store can be injected in unit and
 * property tests instead of the real `window.localStorage`.
 *
 * Optional hooks (`failOnGet` / `failOnSet`) let tests simulate the
 * retrieval/write failures required by Requirements 9.4 and 9.5.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FakeStorageOptions {
  /** When set, `getItem` throws this error (simulates a retrieval failure). */
  failOnGet?: Error;
  /** When set, `setItem` throws this error (simulates a write/quota failure). */
  failOnSet?: Error;
}

/**
 * Create an in-memory `StorageLike` backed by a `Map`.
 *
 * The returned object also exposes the raw backing map via `__store` so tests
 * can assert that a corrupt value was NOT overwritten (Req 9.4).
 */
export function createFakeStorage(
  options: FakeStorageOptions = {},
): StorageLike & { __store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItem(key: string): string | null {
      if (options.failOnGet) throw options.failOnGet;
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      if (options.failOnSet) throw options.failOnSet;
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}
