import { Validator } from '../db/models/Validator';
import { Order } from '../db/models/Order';
import { DecryptedOrder } from '../types/order';
import logger from '../utils/logger';

export const validatorService = {
  async registerValidator(address: string, publicShare: string) {
    return Validator.create({ address, public_share: publicShare, status: 'active' });
  },

  async getActiveValidators() {
    return Validator.findAll({ where: { status: 'active' } });
  },

  /**
   * PLACEHOLDER: real threshold decryption requires collecting decryption
   * shares from `threshold` validators and combining them. Not implemented —
   * there is no live validator set to coordinate with yet.
   */
  async coordinateDecryption(batchId: string, encryptedOrders: Order[]): Promise<DecryptedOrder[] | null> {
    const validators = await this.getActiveValidators();
    const threshold = Math.ceil((validators.length * 2) / 3);

    logger.warn(
      `[validatorService] coordinateDecryption not implemented (batch ${batchId}, ${encryptedOrders.length} orders, need ${threshold}/${validators.length} validators)`
    );

    return null;
  },
};
