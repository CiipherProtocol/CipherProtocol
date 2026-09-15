import { Sequelize } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import logger from '../utils/logger';

export const sequelize = config.databaseUrl
  ? new Sequelize(config.databaseUrl, { logging: false })
  : (() => {
      fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
      logger.warn(`DATABASE_URL not set — using local SQLite at ${config.sqlitePath}`);
      return new Sequelize({
        dialect: 'sqlite',
        storage: config.sqlitePath,
        logging: false,
      });
    })();
