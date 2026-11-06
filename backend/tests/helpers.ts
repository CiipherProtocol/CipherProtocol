import { Keypair } from '@stellar/stellar-sdk';
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

/** Headers that authenticate `user` for a request (see auth middleware). */
export async function authHeaders(_app: Express, user: TestUser): Promise<Record<string, string>> {
  return { 'x-user-address': user.address };
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
