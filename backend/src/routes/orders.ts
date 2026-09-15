import { Router, Request, Response, NextFunction } from 'express';
import { orderController } from '../controllers/orderController';
import { validateAuth } from '../middleware/auth';
import { validateOrderInput } from '../middleware/validation';
import { SubmitOrderBody } from '../types/order';

const router = Router();

router.post(
  '/',
  validateAuth,
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

router.get('/user/:userAddress', async (req: Request, res: Response, next: NextFunction) => {
  try {
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
