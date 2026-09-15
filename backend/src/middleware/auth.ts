import { Request, Response, NextFunction } from 'express';

/**
 * PLACEHOLDER auth. Trusts the `x-user-address` header as-is — anyone can
 * claim any address. Real auth needs the client to sign a challenge with
 * their Stellar key (e.g. via Freighter's signAuthEntry) and this middleware
 * to verify that signature against the claimed address before trusting it.
 */
export function validateAuth(req: Request, res: Response, next: NextFunction) {
  const address = req.header('x-user-address');

  if (!address) {
    res.status(401).json({ error: 'Missing x-user-address header' });
    return;
  }

  req.user = { address };
  next();
}
