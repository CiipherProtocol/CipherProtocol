import { Router, Request, Response, NextFunction } from 'express';
import { settlementController } from '../controllers/settlementController';

const router = Router();

router.get('/:batchId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await settlementController.getSettlementResults(req.params.batchId);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Retry trigger for a batch whose automatic settlement failed (e.g. RPC
// outage). Safe to expose: it can only run the honest decrypt-and-settle
// path, and the conditional claim in settleBatch makes it idempotent.
router.post('/:batchId/settle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settlement = await settlementController.settleBatch(req.params.batchId);
    res.json({ success: true, settlement });
  } catch (error) {
    next(error);
  }
});

export default router;
