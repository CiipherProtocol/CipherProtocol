import crypto from 'crypto';
import { Settlement } from '../db/models/Settlement';
import { Batch } from '../db/models/Batch';
import { Order } from '../db/models/Order';
import { sorobanService } from '../services/sorobanService';
import { validatorService } from '../services/validatorService';
import { AppError, NotFoundError } from '../utils/errors';
import logger from '../utils/logger';

export const settlementController = {
  async getSettlementResults(batchId: string) {
    const settlement = await Settlement.findOne({ where: { batch_id: batchId } });
    if (!settlement) throw new NotFoundError('Settlement not found');
    return settlement;
  },

  /**
   * Batch → threshold decryption → atomic on-chain settlement.
   *
   * Claims the batch with a conditional status update first, so two callers
   * (the batching loop and a manual retry) can never settle it twice.
   */
  async settleBatch(batchId: string) {
    const batch = await Batch.findByPk(batchId);
    if (!batch) throw new NotFoundError('Batch not found');

    const [claimed] = await Batch.update(
      { status: 'submitted' },
      { where: { id: batchId, status: ['created', 'failed'] } }
    );
    if (claimed === 0) throw new AppError('Batch already settled or settling', 409);

    try {
      // Keep the sealed order: validators recompute the on-chain commitment
      // over the ciphertexts exactly as listed.
      const rows = await Order.findAll({ where: { id: batch.order_ids } });
      const byId = new Map(rows.map((o) => [o.id, o]));
      const orders = batch.order_ids.map((id) => byId.get(id)).filter((o): o is Order => !!o);
      const outcomes = await validatorService.coordinateDecryption(batchId, orders);
      const decrypted = outcomes.flatMap((o) => (o.ok ? [{ id: o.orderId, order: o.order }] : []));

      const results = decrypted.length
        ? await sorobanService.settleBatch(batchId, decrypted.map((d) => d.order))
        : [];

      // settle_batch returns one result per input order, in input order.
      await Promise.all([
        ...decrypted.map((d, i) =>
          Order.update(
            { ...d.order, amount_out: results[i]?.amount_out ?? null, status: 'settled' },
            { where: { id: d.id } }
          )
        ),
        ...outcomes.flatMap((o) =>
          o.ok ? [] : [Order.update({ status: 'failed', failure_reason: o.reason }, { where: { id: o.orderId } })]
        ),
      ]);

      const settlement = await Settlement.create({
        id: crypto.randomUUID(),
        batch_id: batchId,
        results,
        status: 'settled',
      });
      await Batch.update({ status: 'settled' }, { where: { id: batchId } });

      const failed = outcomes.length - decrypted.length;
      logger.info(`Settled batch ${batchId}: ${decrypted.length} order(s) executed, ${failed} rejected`);
      return settlement;
    } catch (err) {
      await Batch.update({ status: 'failed' }, { where: { id: batchId } });
      throw err;
    }
  },
};
