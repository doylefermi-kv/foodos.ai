/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The Apps Script `/exec` URL that receives demo requests. Empty or absent
   * in a build made without it — `src/lib/api.ts` degrades to an inline
   * "not configured" state rather than failing at submit time.
   */
  readonly VITE_DEMO_REQUEST_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
