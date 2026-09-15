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

// Dev/manual trigger until validator threshold-decryption is implemented —
// accepts already-decrypted orders directly. See validatorService.
router.post('/:batchId/settle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settlement = await settlementController.settleWithDecryptedOrders(
      req.params.batchId,
      req.body.decrypted_orders ?? []
    );
    res.json({ success: true, settlement });
  } catch (error) {
    next(error);
  }
});

export default router;
