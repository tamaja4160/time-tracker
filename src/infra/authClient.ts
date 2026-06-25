/**
 * Browser-side {@link AuthClient} adapter and the non-secret auth-metadata
 * store (the browser `Auth_Store`) for the **client-only Option A** design.
 *
 * This module wraps the low-level GIS token flow built in task 11.1
 * ({@link createGoogleAuth} in `./googleAuth`) behind the backend-agnostic
 * {@link AuthClient} interface (`src/types/google.ts`), so a future backend
 * (Option B / BFF) could be swapped in without touching the domain or UI.
 *
 * ## Responsibilities
 * - `connect()` launches the Google consent flow via the GIS token client
 *   (Req 11.1-11.2) and persists the resulting non-secret status.
 * - `getStatus()` reports `{ connected, expiresAtMs }` derived from the live
 *   token cache (Req 11.3), mirroring it into the `Auth_Store`.
 * - `signOut()` discards the cached token and clears the connection metadata
 *   (Req 11.5).
 *
 * ## Auth_Store: non-secret metadata only
 * The browser `Auth_Store` persists **only** non-secret connection metadata —
 * `connected`, `expiresAtMs`, and `targetSheetId` — under the key
 * {@link AUTH_META_STORAGE_KEY}. It NEVER stores tokens. (The short-lived
 * access token is mirrored separately by {@link createGoogleAuth} for
 * best-effort reuse; the durable refresh token does not exist in this model.)
 * Save/retrieve failures against the `Auth_Store` are surfaced as
 * {@link AuthStoreError} so the UI can show them and offer re-sign-in, and they
 * never touch the Activity_Log (Req 11.8).
 *
 * ## Documented Option A limitation (~1 hour)
 * Because there is no backend to hold a refresh token, the access token GIS
 * issues lives only ~1 hour and cannot be silently renewed once the Google
 * session no longer permits it. Consequently:
 * - Reuse across browser restarts (Req 11.3) is **best-effort**: a still-valid
 *   token survives a reload, but an expired one requires re-consent.
 * - Automatic renewal before expiry (Req 11.4) is **best-effort** only.
 * - When the token is expired or absent, the UI must prompt re-authorization
 *   before writing to Sheets (Req 11.7); see {@link BrowserAuthClient.needsReauth}.
 *
 * Mapping of GIS failures: {@link connect} lets a {@link GoogleAuthError}
 * (access_denied / timeout / popup_closed / etc.) propagate unchanged so the UI
 * can render a cause-specific message and offer a retry affordance (Req 11.6).
 *
 * _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8_
 */
import type { AuthClient } from '../types/google';
import type { StorageLike } from './fakeStorage';
import { GoogleAuthError, type GoogleAuth } from './googleAuth';

/* -------------------------------------------------------------------------- */
/* Auth_Store metadata                                                         */
/* -------------------------------------------------------------------------- */

/** localStorage key for the browser `Auth_Store` (non-secret metadata only). */
export const AUTH_META_STORAGE_KEY = 'timeTracker.authMeta';

/**
 * Non-secret connection metadata persisted by the browser `Auth_Store`.
 *
 * This deliberately contains NO tokens — only a connection flag, the access
 * token's expiry hint, and the chosen target sheet id (design "Browser-side
 * auth metadata (Auth_Store)").
 */
export interface AuthMeta {
  connected: boolean;
  expiresAtMs: number | null;
  targetSheetId: string | null;
}

/** The empty/disconnected metadata used when nothing is persisted yet. */
const DEFAULT_AUTH_META: AuthMeta = {
  connected: false,
  expiresAtMs: null,
  targetSheetId: null,
};

/** Which `Auth_Store` operation failed, so callers can tailor the message. */
export type AuthStoreOperation = 'save' | 'retrieve';

/**
 * Raised when the browser `Auth_Store` cannot be written or read (Req 11.8).
 *
 * The UI surfaces this and allows the user to sign in again; it must NOT modify
 * the Activity_Log in response.
 */
export class AuthStoreError extends Error {
  readonly operation: AuthStoreOperation;
  readonly cause?: unknown;

  constructor(operation: AuthStoreOperation, message: string, cause?: unknown) {
    super(message);
    this.name = 'AuthStoreError';
    this.operation = operation;
    this.cause = cause;
  }
}

/* -------------------------------------------------------------------------- */
/* Public surface                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The browser auth client: the standard {@link AuthClient} contract plus
 * Option A extras for the `Auth_Store` (target-sheet metadata and a re-auth
 * signal). Keeping the extras here lets the UI persist the chosen sheet without
 * leaking Option A specifics into the backend-agnostic {@link AuthClient}.
 */
export interface BrowserAuthClient extends AuthClient {
  /** Read the full non-secret metadata snapshot (may throw {@link AuthStoreError}). */
  getMeta(): AuthMeta;
  /** Currently designated target sheet id, or `null` (may throw {@link AuthStoreError}). */
  getTargetSheetId(): string | null;
  /** Persist the designated target sheet id (may throw {@link AuthStoreError}). */
  setTargetSheetId(sheetId: string | null): void;
  /**
   * Whether the UI must prompt re-authorization before writing (Req 11.7):
   * `true` when the cached token is absent or expired (Option A ~1h limit).
   */
  needsReauth(): boolean;
}

/** Options for {@link createAuthClient}. */
export interface AuthClientOptions {
  /**
   * The low-level GIS token flow from task 11.1. Injectable so tests can pass a
   * fake {@link GoogleAuth} without the real Google global.
   */
  googleAuth: GoogleAuth;
  /**
   * `Storage`-like dependency backing the `Auth_Store`. Defaults to
   * `window.localStorage` when available; pass a fake in tests, or `null` to
   * disable persistence (metadata then lives in memory only).
   */
  storage?: StorageLike | null;
}

/* -------------------------------------------------------------------------- */
/* Implementation                                                              */
/* -------------------------------------------------------------------------- */

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

function isAuthMeta(value: unknown): value is AuthMeta {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  const connectedOk = typeof m.connected === 'boolean';
  const expiresOk = m.expiresAtMs === null || typeof m.expiresAtMs === 'number';
  const sheetOk = m.targetSheetId === null || typeof m.targetSheetId === 'string';
  return connectedOk && expiresOk && sheetOk;
}

/**
 * Create the browser {@link AuthClient} over an injected {@link GoogleAuth} and
 * a `StorageLike` `Auth_Store`.
 *
 * The live token cache inside {@link GoogleAuth} is the source of truth for
 * "connected"; the `Auth_Store` is a non-secret mirror that survives reloads.
 */
export function createAuthClient(
  options: AuthClientOptions,
): BrowserAuthClient {
  const { googleAuth } = options;
  const storage = resolveStorage(options.storage);

  // In-memory working copy of the metadata. Hydrated from storage on first
  // access so a storage read failure surfaces lazily as an AuthStoreError.
  let meta: AuthMeta = { ...DEFAULT_AUTH_META };
  let hydrated = false;

  /** Read + parse the persisted metadata; throws on a storage read failure. */
  function loadMeta(): AuthMeta {
    if (!storage) return { ...DEFAULT_AUTH_META };
    let raw: string | null;
    try {
      raw = storage.getItem(AUTH_META_STORAGE_KEY);
    } catch (err) {
      throw new AuthStoreError(
        'retrieve',
        'Failed to read the saved Google connection status. You can sign in again.',
        err,
      );
    }
    if (!raw) return { ...DEFAULT_AUTH_META };
    try {
      const parsed: unknown = JSON.parse(raw);
      // Corrupt/old data is treated as absent rather than a hard failure, so a
      // single bad value cannot permanently block sign-in.
      return isAuthMeta(parsed) ? parsed : { ...DEFAULT_AUTH_META };
    } catch {
      return { ...DEFAULT_AUTH_META };
    }
  }

  /** Persist the metadata; throws an {@link AuthStoreError} on write failure. */
  function saveMeta(next: AuthMeta): void {
    meta = next;
    if (!storage) return;
    try {
      storage.setItem(AUTH_META_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      throw new AuthStoreError(
        'save',
        'Failed to save the Google connection status. You can sign in again.',
        err,
      );
    }
  }

  /** Hydrate the in-memory copy from storage once (may throw on read failure). */
  function ensureHydrated(): void {
    if (hydrated) return;
    meta = loadMeta();
    hydrated = true;
  }

  /**
   * Reconcile the persisted metadata with the live token status and persist it,
   * preserving the currently designated target sheet id.
   */
  function syncFromLiveStatus(): { connected: boolean; expiresAtMs: number | null } {
    ensureHydrated();
    const status = googleAuth.getStatus();
    const next: AuthMeta = {
      connected: status.connected,
      expiresAtMs: status.expiresAtMs,
      targetSheetId: meta.targetSheetId,
    };
    saveMeta(next);
    return status;
  }

  return {
    async getStatus(): Promise<{ connected: boolean; expiresAtMs: number | null }> {
      // Source of truth is the live token cache; mirror it into the Auth_Store.
      // A storage failure surfaces as AuthStoreError (Req 11.8) for the UI.
      return syncFromLiveStatus();
    },

    async connect(): Promise<void> {
      ensureHydrated();
      // Launch the GIS consent flow (Req 11.1-11.2). A GoogleAuthError
      // (access_denied / timeout / popup_closed / ...) propagates unchanged so
      // the UI can show a cause-specific message and offer retry (Req 11.6).
      const token = await googleAuth.requestAccessToken({ prompt: 'consent' });
      // Persist non-secret status only — never the token (Req 11.2, 11.8).
      saveMeta({
        connected: true,
        expiresAtMs: token.expiresAtMs,
        targetSheetId: meta.targetSheetId,
      });
    },

    async signOut(): Promise<void> {
      ensureHydrated();
      // Discard the cached access token (Req 11.5) ...
      googleAuth.clearToken();
      // ... and clear the connection metadata while keeping the chosen target
      // sheet, which is not part of the Google_Authorization.
      saveMeta({
        connected: false,
        expiresAtMs: null,
        targetSheetId: meta.targetSheetId,
      });
    },

    getMeta(): AuthMeta {
      ensureHydrated();
      return { ...meta };
    },

    getTargetSheetId(): string | null {
      ensureHydrated();
      return meta.targetSheetId;
    },

    setTargetSheetId(sheetId: string | null): void {
      ensureHydrated();
      saveMeta({ ...meta, targetSheetId: sheetId });
    },

    needsReauth(): boolean {
      // Expired or absent token => re-authorization required before writes
      // (Req 11.7). This is the Option A ~1h limitation surfaced to the UI.
      return googleAuth.isTokenExpired();
    },
  };
}

export { GoogleAuthError };
