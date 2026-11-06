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

  /** HMAC key for auth challenges and session tokens (≥ 32 chars). If unset,
   * a random per-process key is used and sessions reset on restart. */
  authTokenSecret: process.env.AUTH_TOKEN_SECRET || '',

  /** Token symbol -> Soroban contract address, until there's a real token
   * registry. Populated with testnet addresses for local/dev use. */
  tokenContracts: parseTokenContracts(process.env.TOKEN_CONTRACTS),

  batchSize: Number(process.env.BATCH_SIZE) || 100,
  batchTimeoutMs: Number(process.env.BATCH_TIMEOUT_MS) || 30000,

  /** Simulated validator set: `validatorThreshold` of `validatorCount`
   * shares are needed to decrypt any order. */
  validatorCount: Number(process.env.VALIDATOR_COUNT) || 5,
  validatorThreshold: Number(process.env.VALIDATOR_THRESHOLD) || 3,
  /** Where the simulated validators' key shares live (dev only — a real
   * deployment has each share on a different machine). Empty = in-memory. */
  validatorKeyFile:
    process.env.VALIDATOR_KEY_FILE ?? path.join(__dirname, '..', 'data', 'validator-keys.json'),
  /** Validator indices that misbehave (return invalid shares) — for
   * demonstrating that DLEQ proofs catch them. e.g. "2,4". */
  byzantineValidators: (process.env.BYZANTINE_VALIDATORS || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0),
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
