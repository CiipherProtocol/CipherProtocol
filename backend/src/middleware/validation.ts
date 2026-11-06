import { Request, Response, NextFunction } from 'express';
import { parseCiphertext } from '../crypto/orderCipher';
import { validatorService } from '../services/validatorService';
import { SubmitOrderBody } from '../types/order';

const MAX_CIPHERTEXT_LENGTH = 4096;

export function validateOrderInput(req: Request, res: Response, next: NextFunction) {
  const body = req.body as Partial<SubmitOrderBody>;

  if (typeof body.encrypted_data !== 'string' || body.encrypted_data.length > MAX_CIPHERTEXT_LENGTH) {
    res.status(400).json({ error: 'encrypted_data must be a string of at most 4096 characters' });
    return;
  }
  try {
    parseCiphertext(body.encrypted_data);
  } catch (err) {
    res.status(400).json({ error: `encrypted_data is malformed: ${(err as Error).message}` });
    return;
  }

  // Encrypting to a stale or attacker-supplied key would make the order
  // undecryptable (or decryptable by the wrong party) — only accept the
  // validator set's current key.
  if (body.threshold_pubkey !== validatorService.getPublicKeyInfo().threshold_pubkey) {
    res.status(400).json({ error: 'threshold_pubkey does not match the current validator key; refetch /api/config' });
    return;
  }

  if (typeof body.nonce !== 'number' || !Number.isSafeInteger(body.nonce) || body.nonce < 0) {
    res.status(400).json({ error: 'nonce must be a non-negative safe integer' });
    return;
  }

  next();
}
