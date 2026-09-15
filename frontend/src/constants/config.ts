export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
export const STELLAR_NETWORK = import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET';
export const SOROBAN_RPC_URL =
  import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';

export const BATCH_POLL_INTERVAL_MS = 5000;
export const DEFAULT_SLIPPAGE_BPS = 100; // 1%
