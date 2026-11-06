import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { Keypair, TransactionBuilder, Operation, Account, Networks } from '@stellar/stellar-sdk';
import { createApp } from '../src/app';
import { sequelize } from '../src/db';
import { validatorService } from '../src/services/validatorService';
import { authHeaders, newUser, signChallenge, submitSwap } from './helpers';

const app = createApp();

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await validatorService.syncValidatorRegistry();
});
afterAll(() => sequelize.close());

const verify = (transaction: unknown) => request(app).post('/api/auth/verify').send({ transaction });

describe('wallet-signature auth', () => {
  it('issues a session for a correctly signed challenge', async () => {
    const user = newUser();
    const res = await verify(await signChallenge(app, user));
    expect(res.status).toBe(200);
    expect(res.body.address).toBe(user.address);
    expect(typeof res.body.token).toBe('string');
  });

  it('challenge transactions can never be submitted on-chain (sequence 0)', async () => {
    const user = newUser();
    const { body } = await request(app).post('/api/auth/challenge').send({ address: user.address });
    const tx = TransactionBuilder.fromXDR(body.transaction, body.network_passphrase);
    expect((tx as { sequence: string }).sequence).toBe('0');
  });

  it('rejects a challenge signed by a different key (address spoofing)', async () => {
    const victim = newUser();
    const res = await verify(await signChallenge(app, victim, Keypair.random()));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not signed/);
  });

  it('rejects an unsigned challenge', async () => {
    const user = newUser();
    const { body } = await request(app).post('/api/auth/challenge').send({ address: user.address });
    expect((await verify(body.transaction)).status).toBe(401);
  });

  it('rejects a self-made challenge the server never issued', async () => {
    const user = newUser();
    const forged = new TransactionBuilder(new Account(user.address, '-1'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.manageData({ name: 'cipher-protocol auth', value: Buffer.alloc(64, 7) }))
      .setTimeout(300)
      .build();
    forged.sign(user.keypair);
    const res = await verify(forged.toXDR());
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not issued by this server/);
  });

  it('rejects garbage and non-account addresses', async () => {
    expect((await verify('AAAA')).status).toBe(401);
    expect((await verify(42)).status).toBe(400);
    const bad = await request(app).post('/api/auth/challenge').send({ address: 'CCONTRACT' });
    expect(bad.status).toBe(400);
  });

  it('protects order submission: no token, forged token, or legacy header is rejected', async () => {
    const user = newUser();
    expect((await request(app).post('/api/orders').send({})).status).toBe(401);
    expect(
      (await request(app).post('/api/orders').set('x-user-address', user.address).send({})).status
    ).toBe(401);
    const { authorization } = await authHeaders(app, user);
    const flip = (c: string) => (c === 'A' ? 'B' : 'A');
    // Every character position, including the final one whose low bits are base64url padding.
    for (const i of [authorization.length - 1, authorization.length - 10, 'Bearer '.length + 2]) {
      const tampered = authorization.slice(0, i) + flip(authorization[i]) + authorization.slice(i + 1);
      expect((await request(app).post('/api/orders').set('authorization', tampered).send({})).status).toBe(401);
    }
  });

  it('binds orders to the authenticated address, and keeps order history private', async () => {
    const [alice, bob] = [newUser(), newUser()];
    const res = await submitSwap(app, alice);
    expect(res.body.order.user_address).toBe(alice.address);

    const own = await request(app).get(`/api/orders/user/${alice.address}`).set(await authHeaders(app, alice));
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);

    const snoop = await request(app).get(`/api/orders/user/${alice.address}`).set(await authHeaders(app, bob));
    expect(snoop.status).toBe(403);
    expect((await request(app).get(`/api/orders/user/${alice.address}`)).status).toBe(401);
  });
});
