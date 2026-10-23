/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Kashi analysis server this build reads song analyses from. Settings can override it. */
  readonly VITE_KASHI_SERVER_URL?: string;
}
