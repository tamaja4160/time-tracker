/**
 * Minimal `Storage`-compatible interface used across infra modules.
 * Separating it from the test double allows production code to depend
 * on this type without pulling in test utilities.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
