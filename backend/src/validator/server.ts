import crypto from 'crypto';
import express, { Express, NextFunction, Request, Response } from 'express';
import { LocalValidator } from './localValidator';

/**
 * HTTP face of one validator process. Every route needs the coordinator's
 * bearer token: the decryption-shares route in particular must never be
 * open, or anyone could collect t shares for a pending order.
 */
export function createValidatorApp(validator: LocalValidator, apiToken: string): Express {
  if (apiToken.length < 32) throw new Error('validator API token must be at least 32 characters');
  const expected = Buffer.from(apiToken);
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', index: validator.index });
  });

  app.use('/v1', (req: Request, res: Response, next: NextFunction) => {
    const given = Buffer.from(/^Bearer (\S+)$/.exec(req.header('authorization') ?? '')?.[1] ?? '');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });

  const route =
    (fn: (body: any) => Promise<unknown>) => // eslint-disable-line @typescript-eslint/no-explicit-any
    async (req: Request, res: Response) => {
      try {
        res.json(await fn(req.body ?? {}));
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    };

  app.get('/v1/info', route(() => validator.info()));
  app.post('/v1/decryption-shares', route((b) => validator.requestDecryptionShares(String(b.batchId), b.ciphertexts)));
  app.post('/v1/dkg/begin', route((b) => validator.dkgBegin(String(b.session), b.threshold, b.participants)));
  app.post('/v1/dkg/deal', route((b) => validator.dkgDeal(b.transportKeys ?? [])));
  app.post('/v1/dkg/receive', route((b) => validator.dkgReceive(b.broadcasts ?? [], b.sharesForMe ?? [])));
  app.post('/v1/dkg/respond', route((b) => validator.dkgRespond(b.complaints ?? [])));
  app.post('/v1/dkg/finalize', route((b) => validator.dkgFinalize(b.transcript ?? { broadcasts: [], complaints: [], reveals: [] })));

  return app;
}
