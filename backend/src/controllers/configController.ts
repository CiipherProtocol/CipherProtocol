import { validatorService } from '../services/validatorService';

export const configController = {
  /** The validator set's group public key — what clients encrypt orders to. */
  getPublicConfig() {
    return validatorService.getPublicKeyInfo();
  },
};
