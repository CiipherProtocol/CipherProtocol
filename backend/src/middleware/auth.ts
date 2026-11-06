import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

/**
 * Requires `Authorization: Bearer <session token>`, obtained by signing a
 * challenge with the wallet (POST /api/auth/challenge → /api/auth/verify).
 * The address comes from the verified token — never from client input.
 */
export function validateAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer (\S+)$/.exec(header);
  const session = match ? authService.verifySession(match[1]) : null;

  if (!session) {
    res.status(401).json({ error: 'Missing or invalid session; sign in with your wallet' });
    return;
  }

  req.user = { address: session.address };
  next();
}
