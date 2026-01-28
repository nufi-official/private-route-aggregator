/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_URL: string;
  readonly VITE_NEAR_INTENTS_JWT_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
