import { Router, Request, Response } from 'express';
import { configController } from '../controllers/configController';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(configController.getPublicConfig());
});

export default router;
