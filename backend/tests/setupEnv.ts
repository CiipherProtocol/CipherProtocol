// Runs before any module is imported: isolated in-memory DB, in-memory
// validator keys, no on-chain calls (contract IDs unset → stubbed results).
process.env.DATABASE_URL = ':memory:';
process.env.VALIDATOR_KEY_DIR = '';
process.env.VALIDATOR_COUNT = '5';
process.env.VALIDATOR_THRESHOLD = '3';
process.env.ORDER_VAULT_CONTRACT = '';
process.env.SETTLEMENT_ENGINE_CONTRACT = '';
process.env.AUTH_TOKEN_SECRET = 'test-secret-test-secret-test-secret';
