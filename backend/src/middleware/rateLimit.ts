import { Request, Response, NextFunction } from 'express';

/**
 * Small fixed-window rate limiter (in-memory, per process). Enough to keep
 * a public demo from being trivially flooded. A multi-instance deployment
 * would move the counters to a shared store such as Redis.
 */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string; name: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const keyOf = opts.key ?? ((req: Request) => req.ip ?? 'unknown');

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, opts.windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = keyOf(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(k, entry);
    }
    entry.count++;
    res.setHeader('RateLimit-Limit', String(opts.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.max - entry.count)));
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: `Too many ${opts.name} requests; try again shortly` });
      return;
    }
    next();
  };
}
