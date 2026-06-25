/**
 * Unit tests for LogStore failure and empty paths (task 7.3).
 *
 * These example-based tests complement the round-trip property test (task 7.2)
 * by pinning down the concrete failure and empty-store behaviors:
 * - Req 9.3: a fresh/empty store loads as an empty log.
 * - Req 9.4: a corrupt stored value yields a load-failure result AND the raw
 *   stored value is left untouched (not overwritten). Also covers an injected
 *   read failure.
 * - Req 9.5: an injected write failure yields a save-failure result.
 */
import { describe, test, expect } from 'vitest';
import type { LogEntry } from '../types';
import { createLogStore, LOG_STORE_KEY } from './logStore';
import { createFakeStorage } from './fakeStorage';

function sampleEntry(): LogEntry {
  return {
    id: 'a1b2c3',
    date: '2025-01-15',
    startTime: '09:00:00',
    endTime: '09:15:00',
    description: 'wrote design',
    startEpochMs: 1736931600000,
  };
}

describe('LogStore empty path (Req 9.3)', () => {
  test('a fresh store load() returns an empty log', () => {
    const storage = createFakeStorage();
    const store = createLogStore(storage);

    const result = store.load();

    expect(result).toEqual({ ok: true, value: [] });
  });
});

describe('LogStore corrupt-value retrieval failure (Req 9.4)', () => {
  test('invalid JSON yields a load failure and does not overwrite the raw value', () => {
    const storage = createFakeStorage();
    const corruptRaw = '{ this is not valid JSON';
    storage.setItem(LOG_STORE_KEY, corruptRaw);
    const store = createLogStore(storage);

    const result = store.load();

    expect(result.ok).toBe(false);
    // Raw stored value must be left untouched (recoverable data preserved).
    expect(storage.__store.get(LOG_STORE_KEY)).toBe(corruptRaw);
  });

  test('structurally-invalid JSON yields a load failure and does not overwrite the raw value', () => {
    const storage = createFakeStorage();
    // Parses as JSON but is not a valid log envelope (missing version/entries).
    const structurallyInvalidRaw = JSON.stringify({ foo: 'bar', entries: 'nope' });
    storage.setItem(LOG_STORE_KEY, structurallyInvalidRaw);
    const store = createLogStore(storage);

    const result = store.load();

    expect(result.ok).toBe(false);
    expect(storage.__store.get(LOG_STORE_KEY)).toBe(structurallyInvalidRaw);
  });

  test('an injected read failure yields a load failure', () => {
    const storage = createFakeStorage({ failOnGet: new Error('read denied') });
    const store = createLogStore(storage);

    const result = store.load();

    expect(result.ok).toBe(false);
  });
});

describe('LogStore write failure (Req 9.5)', () => {
  test('an injected write failure yields a save failure', () => {
    const storage = createFakeStorage({ failOnSet: new Error('quota') });
    const store = createLogStore(storage);

    const result = store.save([sampleEntry()]);

    expect(result.ok).toBe(false);
  });
});
