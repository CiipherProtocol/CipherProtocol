import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
