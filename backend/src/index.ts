import { config } from './config';
import { sequelize } from './db';
import { createApp } from './app';
import { batchingService } from './services/batchingService';
import { validatorService } from './services/validatorService';
import logger from './utils/logger';

const app = createApp();

async function start() {
  await sequelize.authenticate();
  logger.info('Database connected');

  // Dev convenience: create/update tables from models. Production should use
  // real migrations (e.g. umzug/sequelize-cli) instead of sync().
  await sequelize.sync({ alter: true });

  await validatorService.syncValidatorRegistry();
  const keyInfo = validatorService.getPublicKeyInfo();
  logger.info(
    `Validator set ready: ${keyInfo.threshold}-of-${keyInfo.validator_count}, group key ${keyInfo.threshold_pubkey}`
  );

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
