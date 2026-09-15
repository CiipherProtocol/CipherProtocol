import { storageService } from '../services/storageService';
import { randomHex } from '../utils/crypto';

export const configController = {
  /**
   * Placeholder threshold pubkey, generated once per process and reused —
   * there's no real threshold key ceremony yet (see validatorService).
   */
  getPublicConfig() {
    const threshold_pubkey = storageService.getOrSet('threshold_pubkey', () => randomHex(32));
    return { threshold_pubkey };
  },
};
