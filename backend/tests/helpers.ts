import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import request from 'supertest';
import { Express } from 'express';
import { encryptOrder } from '../src/crypto/orderCipher';

export interface TestUser {
  keypair: Keypair;
  address: string;
}

export function newUser(): TestUser {
  const keypair = Keypair.random();
  return { keypair, address: keypair.publicKey() };
}

/** Signs the server's challenge exactly as Freighter would, returning the signed XDR. */
export async function signChallenge(app: Express, user: TestUser, signer: Keypair = user.keypair) {
  const { body } = await request(app).post('/api/auth/challenge').send({ address: user.address });
  const tx = TransactionBuilder.fromXDR(body.transaction, body.network_passphrase);
  tx.sign(signer);
  return tx.toXDR();
}

const sessions = new Map<string, string>();

/** Headers that authenticate `user` via the real challenge → sign → verify flow. */
export async function authHeaders(app: Express, user: TestUser): Promise<Record<string, string>> {
  let token = sessions.get(user.address);
  if (!token) {
    const res = await request(app).post('/api/auth/verify').send({ transaction: await signChallenge(app, user) });
    if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
    token = res.body.token as string;
    sessions.set(user.address, token);
  }
  return { authorization: `Bearer ${token}` };
}

let nonceCounter = 1;

export async function submitSwap(
  app: Express,
  user: TestUser,
  overrides: Partial<Record<string, unknown>> = {},
  opts: { encryptAs?: string } = {}
) {
  const { body: cfg } = await request(app).get('/api/config');
  const nonce = nonceCounter++;
  const order = {
    user: user.address,
    token_in: 'USDC',
    token_out: 'USDT',
    amount_in: '15000000',
    min_amount_out: '14850000',
    nonce,
    ...overrides,
  };
  const encrypted_data = await encryptOrder(JSON.stringify(order), cfg.threshold_pubkey, opts.encryptAs ?? user.address);
  return request(app)
    .post('/api/orders')
    .set(await authHeaders(app, user))
    .send({ encrypted_data, threshold_pubkey: cfg.threshold_pubkey, nonce });
}
