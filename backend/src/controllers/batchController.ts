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

    const orders = await Order.findAll({ where: { id: orderIds } });
    if (orders.length !== orderIds.length) {
      throw new AppError('Some orders not found');
    }

    const batch = await Batch.create({
      id: crypto.randomUUID(),
      order_ids: orderIds,
      status: 'created',
    });

    await sorobanService.createBatch(batch.id, orderIds);

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
