/**
 * Client-only Google OAuth token flow via Google Identity Services (GIS).
 *
 * This is the browser ("token") half of the **Option A, no-backend** design
 * (see design "Google authorization architecture decision" — Option A row and
 * the fallback paragraph). It uses the GIS token-client model
 * (`google.accounts.oauth2.initTokenClient`) to obtain a short-lived OAuth
 * access token directly in the browser and calls the Google Sheets/Drive REST
 * APIs with it. There is **no client secret** and **no refresh token** in this
 * model — keeping secrets out of the browser.
 *
 * Task 11.1 builds this low-level module; the {@link AuthClient} adapter
 * (task 12.1) wraps it and persists only non-secret status metadata.
 *
 * ## Documented limitation (Option A tradeoff)
 * The access token GIS issues lives only ~1 hour (`expires_in` ≈ 3600s) and
 * **cannot** be silently renewed without a refresh token. As a result:
 * - Req 11.3 (reuse across browser restarts) is **best-effort**: we mirror the
 *   token + expiry to `localStorage` so a still-valid token survives a reload,
 *   but once it expires the user must re-consent.
 * - Req 11.4 (automatic renewal before/upon expiry) is **best-effort**: the
 *   only "renewal" available is re-running the token request, which GIS may be
 *   able to satisfy silently (`prompt: ''`) while the Google session/cookies
 *   allow it, otherwise it prompts.
 * - Req 11.7: when the cached token is expired and cannot be silently renewed,
 *   callers prompt re-authorization (use {@link isTokenExpired}).
 *
 * Security note: storing the access token in `localStorage` exposes it to XSS;
 * this is the explicit, documented cost of the no-backend option. No refresh
 * token (the durable credential) is ever present in the browser.
 *
 * The module performs **no network access at import time**: the GIS token
 * client is created lazily on first use, and the GIS global (or an injected
 * fake) is only read then.
 *
 * _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
 */
import type { StorageLike } from './fakeStorage';

/* -------------------------------------------------------------------------- */
/* Minimal Google Identity Services (GIS) typings                              */
/* There is no npm @types dependency for GIS, so we declare the small subset    */
/* of the global surface this module depends on. See:                           */
/* https://developers.google.com/identity/oauth2/web/reference/js-reference     */
/* -------------------------------------------------------------------------- */

/** Configuration passed to `google.accounts.oauth2.initTokenClient`. */
export interface GisTokenClientConfig {
  client_id: string;
  scope: string;
  /** Invoked with the token response on success (or with `error` set). */
  callback: (response: GisTokenResponse) => void;
  /** Invoked when the flow fails before a token response (e.g. popup closed). */
  error_callback?: (error: GisErrorResponse) => void;
}

/** The token client returned by `initTokenClient`. */
export interface GisTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
}

/** Response delivered to the success `callback`. */
export interface GisTokenResponse {
  access_token?: string;
  /** Lifetime of the access token in seconds (typically ~3600). */
  expires_in?: number;
  scope?: string;
  token_type?: string;
  /** Present when the grant failed (e.g. `access_denied`). */
  error?: string;
  error_description?: string;
}

/** Error object delivered to `error_callback`. */
export interface GisErrorResponse {
  /** e.g. `popup_closed`, `popup_failed_to_open`, `unknown`. */
  type?: string;
  message?: string;
}

/** The shape of `window.google.accounts.oauth2` we depend on. */
export interface GisOauth2 {
  initTokenClient(config: GisTokenClientConfig): GisTokenClient;
}

/** The shape of the `window.google` global we depend on. */
export interface GoogleIdentityServices {
  accounts: { oauth2: GisOauth2 };
}

declare global {
  // eslint-disable-next-line no-var
  interface Window {
    google?: GoogleIdentityServices;
  }
}

/* -------------------------------------------------------------------------- */
/* Module types                                                                */
/* -------------------------------------------------------------------------- */

/**
 * OAuth scopes requested on connect:
 * - `spreadsheets`: read/write the user's Google Sheets.
 * - `drive.file`: create new spreadsheets owned by this app.
 */
export const GOOGLE_AUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  // Read-only access to file metadata so the app can LIST the user's existing
  // spreadsheets for selection (drive.file alone only sees app-created files).
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const;

/** Default time to wait for a consent/authorization response (Req 11.6). */
export const DEFAULT_AUTH_TIMEOUT_MS = 120_000;

/** localStorage key for the best-effort same-session/restart token mirror. */
export const GOOGLE_AUTH_STORAGE_KEY = 'timeTracker.googleAuthToken';

/** A cached access token and the absolute epoch-ms at which it expires. */
export interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/** Non-secret connection status exposed to callers (Req 11.3). */
export interface AuthStatus {
  connected: boolean;
  expiresAtMs: number | null;
}

/**
 * Cause categories for authorization failures, so callers can react
 * specifically and offer a retry affordance (Req 11.6).
 */
export type GoogleAuthErrorCause =
  | 'access_denied' // user declined consent
  | 'timeout' // no response within the timeout window
  | 'popup_closed' // user closed the consent popup
  | 'popup_failed_to_open' // browser blocked the popup
  | 'no_token' // response carried no access token
  | 'gis_unavailable' // the GIS library/global is not present
  | 'in_progress' // a request is already pending
  | 'unknown';

/** Error thrown/rejected from {@link GoogleAuth.requestAccessToken}. */
export class GoogleAuthError extends Error {
  readonly cause: GoogleAuthErrorCause;

  constructor(cause: GoogleAuthErrorCause, message: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.cause = cause;
  }
}

/** Factory that produces a GIS token client; injectable for tests. */
export type TokenClientFactory = (
  config: GisTokenClientConfig,
) => GisTokenClient;

/** Options for {@link createGoogleAuth}. */
export interface GoogleAuthOptions {
  /** OAuth client id for this application. */
  clientId: string;
  /** Override the requested scopes (defaults to {@link GOOGLE_AUTH_SCOPES}). */
  scopes?: readonly string[];
  /** Authorization response timeout in ms (defaults to 120 s; Req 11.6). */
  timeoutMs?: number;
  /**
   * Injectable token-client factory. Defaults to a factory that reads
   * `window.google.accounts.oauth2.initTokenClient`, allowing tests to inject
   * a fake GIS token client without the real global (task 11.2).
   */
  tokenClientFactory?: TokenClientFactory;
  /**
   * `Storage`-like dependency used to mirror the token for reuse. Defaults to
   * `window.localStorage` when available. Pass `null` to disable persistence,
   * or a fake in tests.
   */
  storage?: StorageLike | null;
  /** Injectable time source (defaults to `Date.now`); eases testing expiry. */
  now?: () => number;
}

/** Options for an individual token request. */
export interface RequestAccessTokenOptions {
  /**
   * GIS prompt mode. `'consent'` forces the consent screen (used on explicit
   * connect, Req 11.1). `''` attempts a silent re-grant for best-effort
   * renewal (Req 11.4) while the Google session allows it.
   */
  prompt?: 'consent' | 'select_account' | '';
}

/** The public surface the {@link AuthClient} (task 12.1) will wrap. */
export interface GoogleAuth {
  /** Launch the GIS token flow; resolves with the cached token (Req 11.1-11.2). */
  requestAccessToken(options?: RequestAccessTokenOptions): Promise<CachedToken>;
  /** Return the in-memory cached token, or `null` if none (Req 11.3). */
  getCachedToken(): CachedToken | null;
  /** Whether the given/cached token is expired (Req 11.4/11.7). */
  isTokenExpired(token?: CachedToken | null): boolean;
  /** Non-secret status `{ connected, expiresAtMs }` (Req 11.3). */
  getStatus(): AuthStatus;
  /** Discard the cached token (sign-out, Req 11.5). */
  clearToken(): void;
}

/* -------------------------------------------------------------------------- */
/* Implementation                                                              */
/* -------------------------------------------------------------------------- */

/** Default factory: read the real GIS global at call time (never at import). */
const defaultTokenClientFactory: TokenClientFactory = (config) => {
  const google = typeof window !== 'undefined' ? window.google : undefined;
  const oauth2 = google?.accounts?.oauth2;
  if (!oauth2 || typeof oauth2.initTokenClient !== 'function') {
    throw new GoogleAuthError(
      'gis_unavailable',
      'Google Identity Services is not available. Ensure the GIS script is loaded.',
    );
  }
  return oauth2.initTokenClient(config);
};

function humanMessageForCause(cause: GoogleAuthErrorCause): string {
  switch (cause) {
    case 'access_denied':
      return 'Authorization was denied. You can retry connecting to Google.';
    case 'timeout':
      return 'No authorization response was received within the time limit. Please try again.';
    case 'popup_closed':
      return 'The Google sign-in window was closed before authorization completed. Please try again.';
    case 'popup_failed_to_open':
      return 'The Google sign-in window could not be opened. Check your popup blocker and try again.';
    case 'no_token':
      return 'Google did not return an access token. Please try again.';
    case 'gis_unavailable':
      return 'Google Identity Services is not available. Ensure the GIS script is loaded.';
    case 'in_progress':
      return 'An authorization request is already in progress.';
    default:
      return 'Authorization failed for an unknown reason. Please try again.';
  }
}

/** Map a GIS `error_callback` payload to a {@link GoogleAuthErrorCause}. */
function causeFromGisError(error: GisErrorResponse): GoogleAuthErrorCause {
  switch (error.type) {
    case 'popup_closed':
      return 'popup_closed';
    case 'popup_failed_to_open':
      return 'popup_failed_to_open';
    default:
      return 'unknown';
  }
}

function resolveStorage(
  option: StorageLike | null | undefined,
): StorageLike | null {
  if (option === null) return null; // persistence explicitly disabled
  if (option) return option;
  if (typeof window !== 'undefined') {
    try {
      return window.localStorage;
    } catch {
      return null; // localStorage can throw in some sandboxed contexts
    }
  }
  return null;
}

function isCachedToken(value: unknown): value is CachedToken {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return typeof t.accessToken === 'string' && typeof t.expiresAtMs === 'number';
}

/**
 * Create a client-only Google authorization helper.
 *
 * The returned object is the low-level token flow that the {@link AuthClient}
 * adapter (task 12.1) wraps. It caches the access token in memory and (by
 * default) mirrors it to `localStorage` for best-effort reuse.
 */
export function createGoogleAuth(options: GoogleAuthOptions): GoogleAuth {
  const {
    clientId,
    scopes = GOOGLE_AUTH_SCOPES,
    timeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
    tokenClientFactory = defaultTokenClientFactory,
    now = Date.now,
  } = options;

  const scopeString = scopes.join(' ');
  const storage = resolveStorage(options.storage);

  let cached: CachedToken | null = loadPersisted();
  let client: GisTokenClient | null = null;

  // A single in-flight request's continuation. GIS's token client invokes one
  // shared callback per request, so we route it to the current promise.
  let pending: {
    resolve: (token: CachedToken) => void;
    reject: (err: GoogleAuthError) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  function loadPersisted(): CachedToken | null {
    if (!storage) return null;
    let raw: string | null;
    try {
      raw = storage.getItem(GOOGLE_AUTH_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isCachedToken(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function persist(token: CachedToken | null): void {
    if (!storage) return;
    try {
      if (token) {
        storage.setItem(GOOGLE_AUTH_STORAGE_KEY, JSON.stringify(token));
      } else {
        storage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
      }
    } catch {
      // Best-effort mirror only; in-memory cache remains the source of truth.
    }
  }

  function settleSuccess(token: CachedToken): void {
    const p = pending;
    if (!p) return; // stale callback (e.g. after a timeout) — ignore
    clearTimeout(p.timer);
    pending = null;
    p.resolve(token);
  }

  function settleFailure(cause: GoogleAuthErrorCause, message?: string): void {
    const p = pending;
    if (!p) return; // stale callback — ignore
    clearTimeout(p.timer);
    pending = null;
    p.reject(new GoogleAuthError(cause, message ?? humanMessageForCause(cause)));
  }

  function handleTokenResponse(response: GisTokenResponse): void {
    if (response.error) {
      const cause: GoogleAuthErrorCause =
        response.error === 'access_denied' ? 'access_denied' : 'unknown';
      settleFailure(cause, response.error_description ?? response.error);
      return;
    }
    if (!response.access_token) {
      settleFailure('no_token');
      return;
    }
    const expiresInSec =
      typeof response.expires_in === 'number' && response.expires_in > 0
        ? response.expires_in
        : 3600;
    const token: CachedToken = {
      accessToken: response.access_token,
      expiresAtMs: now() + expiresInSec * 1000,
    };
    cached = token;
    persist(token);
    settleSuccess(token);
  }

  function handleError(error: GisErrorResponse): void {
    settleFailure(causeFromGisError(error), error.message);
  }

  function ensureClient(): GisTokenClient {
    if (client) return client;
    client = tokenClientFactory({
      client_id: clientId,
      scope: scopeString,
      callback: handleTokenResponse,
      error_callback: handleError,
    });
    return client;
  }

  return {
    requestAccessToken(
      requestOptions: RequestAccessTokenOptions = {},
    ): Promise<CachedToken> {
      return new Promise<CachedToken>((resolve, reject) => {
        if (pending) {
          // Only one outstanding request at a time; caller may retry later.
          reject(new GoogleAuthError('in_progress', humanMessageForCause('in_progress')));
          return;
        }

        let activeClient: GisTokenClient;
        try {
          activeClient = ensureClient();
        } catch (err) {
          if (err instanceof GoogleAuthError) {
            reject(err);
          } else {
            reject(new GoogleAuthError('unknown', describeError(err)));
          }
          return;
        }

        // Reject if no response arrives within the timeout window (Req 11.6).
        const timer = setTimeout(() => {
          pending = null;
          reject(new GoogleAuthError('timeout', humanMessageForCause('timeout')));
        }, timeoutMs);

        pending = { resolve, reject, timer };

        try {
          // Default to forcing consent on explicit connect (Req 11.1).
          activeClient.requestAccessToken({
            prompt: requestOptions.prompt ?? 'consent',
          });
        } catch (err) {
          clearTimeout(timer);
          pending = null;
          reject(new GoogleAuthError('unknown', describeError(err)));
        }
      });
    },

    getCachedToken(): CachedToken | null {
      return cached;
    },

    isTokenExpired(token: CachedToken | null = cached): boolean {
      if (!token) return true; // absent token is treated as needing re-auth
      return now() >= token.expiresAtMs;
    },

    getStatus(): AuthStatus {
      if (!cached) return { connected: false, expiresAtMs: null };
      return {
        connected: now() < cached.expiresAtMs,
        expiresAtMs: cached.expiresAtMs,
      };
    },

    clearToken(): void {
      cached = null;
      persist(null);
    },
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
