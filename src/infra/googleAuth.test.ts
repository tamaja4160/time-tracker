/**
 * Integration tests for the client-only Google auth flow (task 11.2).
 *
 * These example-based tests exercise {@link createGoogleAuth} end-to-end against
 * a *fake* GIS token client (no real `window.google` global) and the in-memory
 * {@link createFakeStorage} fake. Time is injected via `now` for deterministic
 * expiry, and Vitest fake timers drive the timeout path.
 *
 * Coverage map:
 * - 11.1  consent launch forces prompt 'consent' with spreadsheets + drive.file scopes
 * - 11.2  access token + expiry derived from expires_in and injected now() are cached
 * - 11.3  a cached, unexpired token reports connected without a new consent launch
 * - 11.4/11.7  once now() passes expiresAtMs, isTokenExpired() signals re-auth
 * - 11.5  clearToken() clears the cache and the persisted mirror (forces re-auth)
 * - 11.6  access_denied -> GoogleAuthError cause 'access_denied'; no callback -> 'timeout'
 *
 * It also lightly covers {@link createAuthClient} (`needsReauth` / `signOut`).
 *
 * _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGoogleAuth,
  GoogleAuthError,
  GOOGLE_AUTH_SCOPES,
  GOOGLE_AUTH_STORAGE_KEY,
  DEFAULT_AUTH_TIMEOUT_MS,
  type GisTokenClient,
  type GisTokenClientConfig,
  type GisTokenResponse,
  type GisErrorResponse,
  type TokenClientFactory,
} from './googleAuth';
import { createAuthClient, AUTH_META_STORAGE_KEY } from './authClient';
import { createFakeStorage } from './fakeStorage';

/* -------------------------------------------------------------------------- */
/* Fake GIS token client harness                                              */
/* -------------------------------------------------------------------------- */

interface FakeGisHarness {
  factory: TokenClientFactory;
  /** Configs captured for each created token client (usually one). */
  configs: GisTokenClientConfig[];
  /** prompt overrides captured for each requestAccessToken call. */
  prompts: Array<string | undefined>;
  /** Number of requestAccessToken invocations across all clients. */
  requestCount: number;
}

type Scenario =
  | { kind: 'success'; accessToken: string; expiresIn?: number }
  | { kind: 'errorResponse'; error: string; errorDescription?: string }
  | { kind: 'errorCallback'; error: GisErrorResponse }
  | { kind: 'silent' }; // never invokes any callback (drives the timeout path)

/**
 * Build a fake GIS token client factory. The captured `callback` /
 * `error_callback` are invoked synchronously per the supplied scenario when
 * `requestAccessToken` is called, mimicking how GIS routes a single shared
 * callback per request.
 */
function makeFakeGis(scenario: Scenario): FakeGisHarness {
  const harness: FakeGisHarness = {
    configs: [],
    prompts: [],
    requestCount: 0,
    factory: () => ({ requestAccessToken: () => {} }),
  };

  harness.factory = (config: GisTokenClientConfig): GisTokenClient => {
    harness.configs.push(config);
    return {
      requestAccessToken(override?: { prompt?: string }) {
        harness.requestCount += 1;
        harness.prompts.push(override?.prompt);
        switch (scenario.kind) {
          case 'success': {
            const response: GisTokenResponse = {
              access_token: scenario.accessToken,
              expires_in: scenario.expiresIn ?? 3600,
              token_type: 'Bearer',
              scope: GOOGLE_AUTH_SCOPES.join(' '),
            };
            config.callback(response);
            break;
          }
          case 'errorResponse': {
            config.callback({
              error: scenario.error,
              error_description: scenario.errorDescription,
            });
            break;
          }
          case 'errorCallback': {
            config.error_callback?.(scenario.error);
            break;
          }
          case 'silent':
            // Intentionally do nothing — simulates a flow that never responds.
            break;
        }
      },
    };
  };

  return harness;
}

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const FIXED_NOW = 1_700_000_000_000; // arbitrary deterministic epoch-ms

/* -------------------------------------------------------------------------- */
/* 11.1 Consent launch                                                         */
/* -------------------------------------------------------------------------- */

describe('consent launch (Req 11.1)', () => {
  test('requestAccessToken triggers the GIS client with prompt "consent" and the required scopes', async () => {
    const gis = makeFakeGis({ kind: 'success', accessToken: 'tok-1' });
    const storage = createFakeStorage();
    const auth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage,
      now: () => FIXED_NOW,
    });

    await auth.requestAccessToken();

    expect(gis.requestCount).toBe(1);
    expect(gis.prompts).toEqual(['consent']);

    // The token client was configured with the client id and the required scopes.
    expect(gis.configs).toHaveLength(1);
    expect(gis.configs[0].client_id).toBe(CLIENT_ID);
    expect(gis.configs[0].scope).toBe(
      'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
    );
    expect(gis.configs[0].scope).toContain(
      'https://www.googleapis.com/auth/spreadsheets',
    );
    expect(gis.configs[0].scope).toContain(
      'https://www.googleapis.com/auth/drive.file',
    );
    // drive.metadata.readonly lets the app list the user's existing sheets.
    expect(gis.configs[0].scope).toContain(
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 11.2 Access-token + expiry caching                                          */
/* -------------------------------------------------------------------------- */

describe('access-token + expiry caching (Req 11.2)', () => {
  test('on success, the cached token and status reflect expires_in derived from now()', async () => {
    const gis = makeFakeGis({
      kind: 'success',
      accessToken: 'tok-abc',
      expiresIn: 3600,
    });
    const storage = createFakeStorage();
    const auth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage,
      now: () => FIXED_NOW,
    });

    const token = await auth.requestAccessToken();

    const expectedExpiry = FIXED_NOW + 3600 * 1000;
    expect(token).toEqual({
      accessToken: 'tok-abc',
      expiresAtMs: expectedExpiry,
    });
    expect(auth.getCachedToken()).toEqual({
      accessToken: 'tok-abc',
      expiresAtMs: expectedExpiry,
    });
    expect(auth.getStatus()).toEqual({
      connected: true,
      expiresAtMs: expectedExpiry,
    });

    // Token + expiry are mirrored to storage for best-effort reuse (Req 11.3).
    const persisted = storage.getItem(GOOGLE_AUTH_STORAGE_KEY);
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted as string)).toEqual({
      accessToken: 'tok-abc',
      expiresAtMs: expectedExpiry,
    });
  });

  test('a missing expires_in falls back to a ~1 hour lifetime', async () => {
    const gis = makeFakeGis({ kind: 'success', accessToken: 'tok-x', expiresIn: 0 });
    const auth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage: createFakeStorage(),
      now: () => FIXED_NOW,
    });

    const token = await auth.requestAccessToken();

    expect(token.expiresAtMs).toBe(FIXED_NOW + 3600 * 1000);
  });
});

/* -------------------------------------------------------------------------- */
/* 11.3 Reuse while unexpired without re-prompt                                */
/* -------------------------------------------------------------------------- */

describe('reuse while unexpired (Req 11.3)', () => {
  test('a persisted, unexpired token reports connected via getStatus without launching consent', () => {
    const storage = createFakeStorage();
    const expiresAtMs = FIXED_NOW + 1800 * 1000; // 30 min in the future
    storage.setItem(
      GOOGLE_AUTH_STORAGE_KEY,
      JSON.stringify({ accessToken: 'restored-tok', expiresAtMs }),
    );

    const gis = makeFakeGis({ kind: 'success', accessToken: 'unused' });
    const auth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage,
      now: () => FIXED_NOW,
    });

    // No consent flow was launched, yet the restored token is reported.
    expect(gis.requestCount).toBe(0);
    expect(auth.getCachedToken()).toEqual({ accessToken: 'restored-tok', expiresAtMs });
    expect(auth.isTokenExpired()).toBe(false);
    expect(auth.getStatus()).toEqual({ connected: true, expiresAtMs });
  });
});

/* -------------------------------------------------------------------------- */
/* 11.4 / 11.7 Expiry triggers re-consent                                      */
/* -------------------------------------------------------------------------- */

describe('expiry triggers re-auth (Req 11.4, 11.7)', () => {
  test('once now() passes expiresAtMs, isTokenExpired() and getStatus() signal re-auth', async () => {
    let current = FIXED_NOW;
    const gis = makeFakeGis({
      kind: 'success',
      accessToken: 'tok-exp',
      expiresIn: 3600,
    });
    const auth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage: createFakeStorage(),
      now: () => current,
    });

    const token = await auth.requestAccessToken();
    expect(auth.isTokenExpired()).toBe(false);
    expect(auth.getStatus().connected).toBe(true);

    // Advance just past the expiry instant.
    current = token.expiresAtMs;
    expect(auth.isTokenExpired()).toBe(true);
    expect(auth.getStatus().connected).toBe(false);
    // Status still surfaces the (now stale) expiry so the UI can explain it.
    expect(auth.getStatus().expiresAtMs).toBe(token.expiresAtMs);
  });

  test('needsReauth() flips to true after expiry via the AuthClient adapter', async () => {
    let current = FIXED_NOW;
    const gis = makeFakeGis({
      kind: 'success',
      accessToken: 'tok-adapter',
      expiresIn: 3600,
    });
    const googleAuth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage: createFakeStorage(),
      now: () => current,
    });
    const client = createAuthClient({ googleAuth, storage: createFakeStorage() });

    await client.connect();
    expect(client.needsReauth()).toBe(false);

    current = FIXED_NOW + 3600 * 1000;
    expect(client.needsReauth()).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 11.5 Sign-out clears cached token and forces re-auth                        */
/* -------------------------------------------------------------------------- */

describe('sign-out clears the cached token (Req 11.5)', () => {
  test('clearToken() empties the cache and removes the persisted mirror', async () => {
    const gis = makeFakeGis({ kind: 'success', accessToken: 'tok-clear' });
    const storage = createFakeStorage();
    const auth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage,
      now: () => FIXED_NOW,
    });

    await auth.requestAccessToken();
    expect(auth.getCachedToken()).not.toBeNull();
    expect(storage.getItem(GOOGLE_AUTH_STORAGE_KEY)).not.toBeNull();

    auth.clearToken();

    expect(auth.getCachedToken()).toBeNull();
    expect(auth.isTokenExpired()).toBe(true);
    expect(auth.getStatus()).toEqual({ connected: false, expiresAtMs: null });
    expect(storage.getItem(GOOGLE_AUTH_STORAGE_KEY)).toBeNull();
  });

  test('signOut() via the AuthClient discards the token and clears the Auth_Store metadata', async () => {
    const gis = makeFakeGis({ kind: 'success', accessToken: 'tok-signout' });
    const authStorage = createFakeStorage();
    const googleAuth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage: createFakeStorage(),
      now: () => FIXED_NOW,
    });
    const client = createAuthClient({ googleAuth, storage: authStorage });

    await client.connect();
    expect(googleAuth.getCachedToken()).not.toBeNull();

    await client.signOut();

    expect(googleAuth.getCachedToken()).toBeNull();
    expect(client.needsReauth()).toBe(true);
    const meta = JSON.parse(
      authStorage.getItem(AUTH_META_STORAGE_KEY) as string,
    );
    expect(meta.connected).toBe(false);
    expect(meta.expiresAtMs).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 11.6 Denial / timeout handling                                              */
/* -------------------------------------------------------------------------- */

describe('denial handling (Req 11.6)', () => {
  test('an access_denied response rejects with GoogleAuthError cause "access_denied"', async () => {
    const gis = makeFakeGis({
      kind: 'errorResponse',
      error: 'access_denied',
      errorDescription: 'The user denied access.',
    });
    const auth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage: createFakeStorage(),
      now: () => FIXED_NOW,
    });

    await expect(auth.requestAccessToken()).rejects.toMatchObject({
      name: 'GoogleAuthError',
      cause: 'access_denied',
    });
    // No token cached after a denial.
    expect(auth.getCachedToken()).toBeNull();
  });
});

describe('timeout handling (Req 11.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('a flow that never responds rejects with cause "timeout" after timeoutMs', async () => {
    const gis = makeFakeGis({ kind: 'silent' });
    const auth = createGoogleAuth({
      clientId: CLIENT_ID,
      tokenClientFactory: gis.factory,
      storage: createFakeStorage(),
      now: () => FIXED_NOW,
      timeoutMs: DEFAULT_AUTH_TIMEOUT_MS,
    });

    const promise = auth.requestAccessToken();
    // Attach the assertion before advancing timers so the rejection is observed.
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'GoogleAuthError',
      cause: 'timeout',
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_AUTH_TIMEOUT_MS + 1);
    await assertion;

    expect(auth.getCachedToken()).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* GoogleAuthError shape                                                       */
/* -------------------------------------------------------------------------- */

describe('GoogleAuthError', () => {
  test('is an Error subclass carrying a typed cause', () => {
    const err = new GoogleAuthError('access_denied', 'denied');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GoogleAuthError');
    expect(err.cause).toBe('access_denied');
  });
});
