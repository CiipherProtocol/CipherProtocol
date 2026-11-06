import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config';
import { sequelize } from './db';
import { errorHandler } from './middleware/errorHandler';
import { batchingService } from './services/batchingService';
import * as routes from './routes';
import logger from './utils/logger';

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', mode: 'encrypted-orderflow-dex' });
});

app.use('/api/orders', routes.orders);
app.use('/api/batches', routes.batches);
app.use('/api/settlement', routes.settlement);
app.use('/api/config', routes.config);

app.use(errorHandler);

async function start() {
  await sequelize.authenticate();
  logger.info('Database connected');

  // Dev convenience: create/update tables from models. Production should use
  // real migrations (e.g. umzug/sequelize-cli) instead of sync().
  await sequelize.sync();

  app.listen(config.port, () => {
    logger.info(`Backend running on port ${config.port}`);
  });

  batchingService.startBatchingLoop();
}

start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
