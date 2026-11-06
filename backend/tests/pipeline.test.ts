import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db';
import { Order } from '../src/db/models/Order';
import { Batch } from '../src/db/models/Batch';
import { generateKeySet } from '../src/crypto/threshold';
import { batchingService } from '../src/services/batchingService';
import { SimulatedValidator, setValidatorNetwork } from '../src/services/validatorNetwork';
import { validatorService } from '../src/services/validatorService';
import { authHeaders, newUser, submitSwap } from './helpers';

const app = createApp();

/** Fresh 3-of-5 validator set where the listed indices misbehave. */
async function useNetwork(byzantine: number[] = []) {
  const keys = generateKeySet(3, 5);
  setValidatorNetwork({
    threshold: keys.threshold,
    groupPublicKey: keys.groupPublicKey,
    validators: keys.shares.map((s) => new SimulatedValidator(s, byzantine.includes(s.index))),
  });
  await validatorService.syncValidatorRegistry();
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
  await useNetwork();
});

afterAll(() => sequelize.close());

describe('submit → batch → threshold decrypt → settle', () => {
  it('stores only ciphertext until the batch is decrypted, then reveals and settles', async () => {
    const alice = newUser();
    const res = await submitSwap(app, alice);
    expect(res.status).toBe(200);

    const stored = await Order.findByPk(res.body.order.id);
    expect(stored!.status).toBe('pending');
    expect(stored!.token_in).toBeNull();
    expect(stored!.amount_in).toBeNull();
    // The plaintext must not be recoverable from anything the backend stored.
    expect(JSON.stringify(stored!.toJSON())).not.toContain('15000000');

    const batch = await batchingService.runOnce();
    expect(batch).not.toBeNull();

    const settled = await Order.findByPk(res.body.order.id);
    expect(settled!.status).toBe('settled');
    expect(settled!.batch_id).toBe(batch!.id);
    expect(settled!.token_in).toBe('USDC');
    expect(settled!.token_out).toBe('USDT');
    expect(settled!.amount_in).toBe('15000000');
    expect((await Batch.findByPk(batch!.id))!.status).toBe('settled');

    const settlement = await request(app).get(`/api/settlement/${batch!.id}`);
    expect(settlement.status).toBe(200);
    expect(settlement.body.results).toHaveLength(1);
  });

  it('settles a multi-user batch in one pass', async () => {
    const users = [newUser(), newUser(), newUser()];
    for (const u of users) expect((await submitSwap(app, u)).status).toBe(200);
    await batchingService.runOnce();
    const orders = await Order.findAll();
    expect(orders.map((o) => o.status)).toEqual(['settled', 'settled', 'settled']);
  });

  it('tolerates up to n − t byzantine validators (their shares fail DLEQ and are dropped)', async () => {
    await useNetwork([2, 4]);
    const res = await submitSwap(app, newUser());
    await batchingService.runOnce();
    expect((await Order.findByPk(res.body.order.id))!.status).toBe('settled');
  });

  it('fails the orders, not the server, when too many validators misbehave', async () => {
    await useNetwork([1, 2, 3]);
    const res = await submitSwap(app, newUser());
    await batchingService.runOnce();
    const order = await Order.findByPk(res.body.order.id);
    expect(order!.status).toBe('failed');
    expect(order!.failure_reason).toMatch(/2\/3 valid decryption shares/);
    expect(order!.token_in).toBeNull();
  });

  it("rejects a ciphertext replayed under another user's account", async () => {
    const [alice, mallory] = [newUser(), newUser()];
    // Mallory submits a ciphertext that was sealed for Alice.
    const res = await submitSwap(app, mallory, { user: alice.address }, { encryptAs: alice.address });
    await batchingService.runOnce();
    const order = await Order.findByPk(res.body.order.id);
    expect(order!.status).toBe('failed');
    expect(order!.failure_reason).toBe('ciphertext failed authentication');
  });

  it('rejects a decrypted order naming a different user than the submitter', async () => {
    const [alice, mallory] = [newUser(), newUser()];
    const res = await submitSwap(app, mallory, { user: alice.address });
    await batchingService.runOnce();
    const order = await Order.findByPk(res.body.order.id);
    expect(order!.status).toBe('failed');
    expect(order!.failure_reason).toMatch(/different user/);
  });

  it('isolates a malformed order from the rest of its batch', async () => {
    const good = await submitSwap(app, newUser());
    const bad = await submitSwap(app, newUser(), { amount_in: '1.5' });
    await batchingService.runOnce();
    expect((await Order.findByPk(good.body.order.id))!.status).toBe('settled');
    const rejected = await Order.findByPk(bad.body.order.id);
    expect(rejected!.status).toBe('failed');
    expect(rejected!.failure_reason).toMatch(/base units/);
  });

  it('never settles a batch twice', async () => {
    await submitSwap(app, newUser());
    const batch = await batchingService.runOnce();
    const retry = await request(app).post(`/api/settlement/${batch!.id}/settle`);
    expect(retry.status).toBe(409);
  });

  it('does nothing when there are no pending orders', async () => {
    expect(await batchingService.runOnce()).toBeNull();
  });
});

describe('order intake validation', () => {
  it('rejects orders encrypted to a stale key', async () => {
    const user = newUser();
    const res = await submitSwap(app, user);
    await useNetwork(); // validator set re-keyed
    const again = await request(app)
      .post('/api/orders')
      .set(await authHeaders(app, user))
      .send({ encrypted_data: res.body.order.encrypted_data, threshold_pubkey: res.body.order.threshold_pubkey, nonce: 999 });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/threshold_pubkey/);
  });

  it('rejects malformed ciphertext and reused nonces', async () => {
    const user = newUser();
    const { body: cfg } = await request(app).get('/api/config');
    const bad = await request(app)
      .post('/api/orders')
      .set(await authHeaders(app, user))
      .send({ encrypted_data: 'base64:not-real', threshold_pubkey: cfg.threshold_pubkey, nonce: 1 });
    expect(bad.status).toBe(400);

    const first = await submitSwap(app, user);
    const dup = await request(app)
      .post('/api/orders')
      .set(await authHeaders(app, user))
      .send({ encrypted_data: first.body.order.encrypted_data, threshold_pubkey: cfg.threshold_pubkey, nonce: first.body.order.nonce });
    expect(dup.status).toBe(409);
  });

  it('publishes the threshold key and parameters', async () => {
    const { body } = await request(app).get('/api/config');
    expect(body).toMatchObject({ threshold: 3, validator_count: 5 });
    expect(body.threshold_pubkey).toMatch(/^[0-9a-f]{64}$/);
  });
});
