import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 5001,

  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: path.join(__dirname, '..', 'data', 'dev.sqlite3'),

  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  orderVaultContract: process.env.ORDER_VAULT_CONTRACT || '',
  settlementEngineContract: process.env.SETTLEMENT_ENGINE_CONTRACT || '',

  /** Signs every on-chain call the backend makes (batch attestations, fee
   * collection). Must be the same identity the contracts were `initialize`d
   * with as admin. */
  backendSignerSecret: process.env.BACKEND_SIGNER_SECRET || '',

  /** Token symbol -> Soroban contract address, until there's a real token
   * registry. Populated with testnet addresses for local/dev use. */
  tokenContracts: parseTokenContracts(process.env.TOKEN_CONTRACTS),

  batchSize: Number(process.env.BATCH_SIZE) || 100,
  batchTimeoutMs: Number(process.env.BATCH_TIMEOUT_MS) || 30000,
};

function parseTokenContracts(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [symbol, address] = pair.split(':');
        return [symbol.trim(), address.trim()];
      })
  );
}
