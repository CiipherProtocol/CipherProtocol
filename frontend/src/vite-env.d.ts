/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_STELLAR_NETWORK: string;
  readonly VITE_SOROBAN_RPC_URL: string;
  readonly VITE_ORDER_VAULT_CONTRACT: string;
  readonly VITE_SETTLEMENT_ENGINE_CONTRACT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
