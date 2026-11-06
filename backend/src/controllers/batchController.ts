import crypto from 'crypto';
import { Batch } from '../db/models/Batch';
import { Order } from '../db/models/Order';
import { sorobanService } from '../services/sorobanService';
import { AppError, NotFoundError } from '../utils/errors';

export const batchController = {
  async createBatch(orderIds: string[]) {
    if (orderIds.length === 0) {
      throw new AppError('order_ids must not be empty');
    }

    const uniqueIds = [...new Set(orderIds)];
    const orders = await Order.findAll({ where: { id: uniqueIds, status: 'pending' } });
    if (orders.length !== uniqueIds.length) {
      throw new AppError('Some orders not found or not pending');
    }
    orderIds = uniqueIds;
    const byId = new Map(orders.map((o) => [o.id, o]));
    const ciphertexts = orderIds.map((id) => byId.get(id)!.encrypted_data);

    // Seal on-chain first: once this succeeds the batch's contents and order
    // are fixed publicly, and only then can validators be asked to decrypt.
    const id = crypto.randomUUID();
    const { contentHash, txHash } = await sorobanService.createBatch(id, ciphertexts);

    const batch = await Batch.create({
      id,
      order_ids: orderIds,
      status: 'created',
      content_hash: contentHash,
      commitment_tx: txHash,
    });
    await Order.update({ status: 'batched', batch_id: batch.id }, { where: { id: orderIds } });

    return batch;
  },

  async getBatch(batchId: string) {
    const batch = await Batch.findByPk(batchId);
    if (!batch) throw new NotFoundError('Batch not found');
    return batch;
  },

  async getBatches() {
    return Batch.findAll({ order: [['created_at', 'DESC']] });
  },
};
