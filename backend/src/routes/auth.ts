import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

const router = Router();

router.post('/challenge', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(authService.createChallenge(req.body?.address));
  } catch (error) {
    next(error);
  }
});

router.post('/verify', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(authService.verifyChallenge(req.body?.transaction));
  } catch (error) {
    next(error);
  }
});

export default router;
