import { Order } from '../db/models/Order';
import { batchController } from '../controllers/batchController';
import { settlementController } from '../controllers/settlementController';
import { config } from '../config';
import logger from '../utils/logger';

let timer: NodeJS.Timeout | null = null;
let running = false;

export const batchingService = {
  /**
   * One tick: seal pending orders into a batch, then threshold-decrypt and
   * settle it. Orders are only decrypted after the batch is sealed, so the
   * contents can't influence which orders get included or in what order.
   */
  async runOnce() {
    const pendingOrders = await Order.findAll({
      where: { status: 'pending' },
      order: [['created_at', 'ASC']],
      limit: config.batchSize,
    });
    if (pendingOrders.length === 0) return null;

    const batch = await batchController.createBatch(pendingOrders.map((o) => o.id));
    logger.info(`Created batch ${batch.id} with ${pendingOrders.length} order(s)`);
    await settlementController.settleBatch(batch.id);
    return batch;
  },

  startBatchingLoop() {
    if (timer) return;
    timer = setInterval(async () => {
      if (running) return; // previous tick still settling
      running = true;
      try {
        await batchingService.runOnce();
      } catch (error) {
        logger.error('Batching loop error:', error);
      } finally {
        running = false;
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
