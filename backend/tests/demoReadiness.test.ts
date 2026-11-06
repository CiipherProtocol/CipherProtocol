import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/middleware/rateLimit';
import { createApp } from '../src/app';
import { sequelize } from '../src/db';
import { Order } from '../src/db/models/Order';
import { validatorService } from '../src/services/validatorService';
import { batchingService } from '../src/services/batchingService';
import { newUser, submitSwap } from './helpers';

describe('rate limiting', () => {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/x', rateLimit({ name: 'test', windowMs: 60_000, max: 3 }), (_req, res) => {
    res.json({ ok: true });
  });

  it('allows up to the limit per client, then answers 429 with Retry-After', async () => {
    const ip = { 'x-forwarded-for': '203.0.113.7' };
    for (let i = 0; i < 3; i++) expect((await request(app).get('/x').set(ip)).status).toBe(200);
    const blocked = await request(app).get('/x').set(ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // A different client is unaffected.
    expect((await request(app).get('/x').set({ 'x-forwarded-for': '203.0.113.8' })).status).toBe(200);
  });
});

describe('demo mode reporting', () => {
  const app = createApp();
  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await validatorService.syncValidatorRegistry();
  });
  afterAll(() => sequelize.close());

  it('says how sealing and settlement actually run', async () => {
    const { body } = await request(app).get('/api/config');
    expect(body).toMatchObject({ sealing: 'dev-ledger', settlement: 'simulated', validator_mode: 'local' });
  });

  it('simulated settlement reveals the order but records no fake amount received', async () => {
    const res = await submitSwap(app, newUser());
    await batchingService.runOnce();
    const order = await Order.findByPk(res.body.order.id);
    expect(order!.status).toBe('settled');
    expect(order!.amount_in).toBe('15000000');
    expect(order!.amount_out).toBeNull();
  });
});
