import crypto from 'crypto';
import { Settlement } from '../db/models/Settlement';
import { Batch } from '../db/models/Batch';
import { sorobanService } from '../services/sorobanService';
import { DecryptedOrder } from '../types/order';
import { AppError, NotFoundError } from '../utils/errors';

export const settlementController = {
  async getSettlementResults(batchId: string) {
    const settlement = await Settlement.findOne({ where: { batch_id: batchId } });
    if (!settlement) throw new NotFoundError('Settlement not found');
    return settlement;
  },

  /**
   * Dev/manual entry point until validatorService.coordinateDecryption is
   * implemented: accepts already-decrypted orders directly rather than
   * decrypting the batch itself.
   */
  async settleWithDecryptedOrders(batchId: string, decryptedOrders: DecryptedOrder[]) {
    const batch = await Batch.findByPk(batchId);
    if (!batch) throw new NotFoundError('Batch not found');

    const existing = await Settlement.findOne({ where: { batch_id: batchId } });
    if (existing) throw new AppError('Batch already settled');

    const results = await sorobanService.settleBatch(batchId, decryptedOrders);

    const settlement = await Settlement.create({
      id: crypto.randomUUID(),
      batch_id: batchId,
      results,
      status: 'settled',
    });

    await batch.update({ status: 'settled' });

    return settlement;
  },
};
