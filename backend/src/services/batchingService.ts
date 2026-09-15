import { Order } from '../db/models/Order';
import { batchController } from '../controllers/batchController';
import { config } from '../config';
import logger from '../utils/logger';

let timer: NodeJS.Timeout | null = null;

export const batchingService = {
  startBatchingLoop() {
    if (timer) return;

    timer = setInterval(async () => {
      try {
        const pendingOrders = await Order.findAll({ where: { status: 'pending' } });
        if (pendingOrders.length === 0) return;

        const orderIds = pendingOrders.slice(0, config.batchSize).map((o) => o.id);
        const batch = await batchController.createBatch(orderIds);
        logger.info(`Created batch ${batch.id} with ${orderIds.length} order(s)`);
      } catch (error) {
        logger.error('Batching loop error:', error);
      }
    }, config.batchTimeoutMs);
  },

  stopBatchingLoop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  },
};
