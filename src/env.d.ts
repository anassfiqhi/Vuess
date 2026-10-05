/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of vuess-server for online games (default http://localhost:4310). */
  readonly VITE_ONLINE_SERVER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
