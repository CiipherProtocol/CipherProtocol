import { Router, Request, Response, NextFunction } from 'express';
import { batchController } from '../controllers/batchController';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const batches = await batchController.getBatches();
    res.json(batches);
  } catch (error) {
    next(error);
  }
});

router.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const batch = await batchController.createBatch(req.body.order_ids ?? []);
    res.json({ success: true, batch });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const batch = await batchController.getBatch(req.params.id);
    res.json(batch);
  } catch (error) {
    next(error);
  }
});

export default router;
