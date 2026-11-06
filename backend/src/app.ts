import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import * as routes from './routes';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', mode: 'encrypted-orderflow-dex' });
  });

  app.use('/api/orders', routes.orders);
  app.use('/api/batches', routes.batches);
  app.use('/api/settlement', routes.settlement);
  app.use('/api/config', routes.config);
  app.use('/api/auth', routes.auth);

  app.use(errorHandler);
  return app;
}
