import { Request, Response, NextFunction } from 'express';
import { SubmitOrderBody } from '../types/order';

const REQUIRED_FIELDS: (keyof SubmitOrderBody)[] = [
  'encrypted_data',
  'threshold_pubkey',
  'token_in',
  'token_out',
  'amount_in',
  'min_amount_out',
  'nonce',
];

export function validateOrderInput(req: Request, res: Response, next: NextFunction) {
  const body = req.body as Partial<SubmitOrderBody>;
  const missing = REQUIRED_FIELDS.filter((field) => body[field] === undefined || body[field] === '');

  if (missing.length > 0) {
    res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
    return;
  }

  if (typeof body.nonce !== 'number' || !Number.isFinite(body.nonce)) {
    res.status(400).json({ error: 'nonce must be a number' });
    return;
  }

  next();
}
