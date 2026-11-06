import { Router, Request, Response, NextFunction } from 'express';
import { orderController } from '../controllers/orderController';
import { validateAuth } from '../middleware/auth';
import { validateOrderInput } from '../middleware/validation';
import { rateLimit } from '../middleware/rateLimit';
import { config } from '../config';
import { SubmitOrderBody } from '../types/order';

const router = Router();

const submitLimit = rateLimit({
  name: 'order',
  windowMs: 60_000,
  max: config.rateLimitOrdersPerMin,
  key: (req) => `${req.ip}|${req.user?.address ?? ''}`,
});

router.post(
  '/',
  validateAuth,
  submitLimit,
  validateOrderInput,
  async (req: Request<unknown, unknown, SubmitOrderBody>, res: Response, next: NextFunction) => {
    try {
      const order = await orderController.submitOrder(req.user!.address, req.body);
      res.json({ success: true, order });
    } catch (error) {
      next(error);
    }
  }
);

// Order history is private: even sealed orders leak timing and frequency.
router.get('/user/:userAddress', validateAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.userAddress !== req.user!.address) {
      res.status(403).json({ error: 'You can only list your own orders' });
      return;
    }
    const orders = await orderController.getUserOrders(req.params.userAddress);
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await orderController.getOrder(req.params.id);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

export default router;
