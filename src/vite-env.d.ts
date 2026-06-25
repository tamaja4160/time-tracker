/// <reference types="vite/client" />

/**
 * Typed environment variables for the client-only (Option A) Google
 * integration. `VITE_GOOGLE_CLIENT_ID` is supplied by the user at build/dev
 * time (e.g. in a `.env` file) and read in `App` with a safe empty-string
 * fallback. See task 14.1.
 */
interface ImportMetaEnv {
  /** OAuth client id for the client-only Google authorization (Option A). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
