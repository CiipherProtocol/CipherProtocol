import { validatorService } from '../services/validatorService';
import { getValidatorNetwork } from '../services/validatorNetwork';
import { config } from '../config';

export const configController = {
  /** The validator set's group public key — what clients encrypt orders to. */
  getPublicConfig() {
    return {
      ...validatorService.getPublicKeyInfo(),
      /** Where batches are sealed: the real order-vault on-chain, or the in-memory dev ledger. */
      sealing: config.orderVaultContract ? 'onchain' : 'dev-ledger',
      order_vault_contract: config.orderVaultContract || null,
      /** 'simulated' = orders are decrypted and validated but no tokens move (e.g. public demo). */
      settlement: config.settlementEngineContract ? 'onchain' : 'simulated',
      validator_mode: getValidatorNetwork().mode,
    };
  },
};
