import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import { Server } from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db';
import { Order } from '../src/db/models/Order';
import { generateIdentity } from '../src/crypto/signing';
import { LocalValidator } from '../src/validator/localValidator';
import { createValidatorApp } from '../src/validator/server';
import { RemoteValidator } from '../src/validator/remoteValidator';
import { connectRemoteNetwork, setValidatorNetwork } from '../src/services/validatorNetwork';
import { validatorService } from '../src/services/validatorService';
import { batchingService } from '../src/services/batchingService';
import { devCommitmentLedger } from '../src/chain/batchCommitment';
import { newUser, submitSwap } from './helpers';

/**
 * Five validators, each behind its own HTTP server with its own key
 * directory, reached only through RemoteValidator — the same code path as
 * separate processes (`npm run validators:dev`), minus the process spawn.
 */
const N = 5;
const T = 3;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cipher-remote-'));
const ids = Array.from({ length: N }, () => generateIdentity());
const peers = Object.fromEntries(ids.map((id, k) => [k + 1, id.publicKey]));
const tokens = ids.map(() => crypto.randomBytes(32).toString('hex'));
const servers: Server[] = [];
const keyDir = (i: number) => path.join(root, `validator-${i}`);
const clusterFile = path.join(root, 'cluster.json');
const app = createApp();

function startValidator(k: number): Promise<Server> {
  const index = k + 1;
  const validator = new LocalValidator(index, {
    identity: ids[k],
    peers,
    keyFile: path.join(keyDir(index), `validator-${index}.json`),
    // Stands in for the chain: the backend seals into it, validators read it.
    commitments: devCommitmentLedger,
  });
  return new Promise((resolve) => {
    const s = createValidatorApp(validator, tokens[k]).listen(0, '127.0.0.1', () => resolve(s));
  });
}

beforeAll(async () => {
  for (let k = 0; k < N; k++) servers.push(await startValidator(k));
  fs.writeFileSync(
    clusterFile,
    JSON.stringify({
      validators: servers.map((s, k) => ({
        index: k + 1,
        url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
        identityKey: ids[k].publicKey,
        apiToken: tokens[k],
      })),
    })
  );
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await sequelize.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('validators as separate network services', () => {
  let groupKey = '';

  it('runs the DKG over HTTP; each validator stores only its own share', async () => {
    const net = await connectRemoteNetwork(clusterFile, T);
    expect(net.mode).toBe('remote');
    groupKey = net.groupPublicKey;
    setValidatorNetwork(net);
    await validatorService.syncValidatorRegistry();

    const secrets = Array.from({ length: N }, (_, k) =>
      JSON.parse(fs.readFileSync(path.join(keyDir(k + 1), `validator-${k + 1}.json`), 'utf8')).secret as string
    );
    expect(new Set(secrets).size).toBe(N);
    for (let k = 0; k < N; k++) {
      const files = fs.readdirSync(keyDir(k + 1));
      expect(files).toEqual([`validator-${k + 1}.json`]);
      const content = fs.readFileSync(path.join(keyDir(k + 1), files[0]), 'utf8');
      secrets.forEach((s, j) => j !== k && expect(content).not.toContain(s));
    }
  });

  it('settles orders by collecting shares over HTTP', async () => {
    const res = await submitSwap(app, newUser());
    await batchingService.runOnce();
    expect((await Order.findByPk(res.body.order.id))!.status).toBe('settled');
  });

  it('a restarted coordinator reuses the existing key instead of re-keying', async () => {
    const net = await connectRemoteNetwork(clusterFile, T);
    expect(net.groupPublicKey).toBe(groupKey);
  });

  it('validators refuse shares for an order that was never sealed in a batch', async () => {
    const res = await submitSwap(app, newUser());
    const order = (await Order.findByPk(res.body.order.id))!;
    // A coordinator holding every API token tries to decrypt a pending order early.
    const [outcome] = await validatorService.coordinateDecryption(crypto.randomUUID(), [order]);
    expect(outcome.ok).toBe(false);
    expect((await Order.findByPk(order.id))!.status).toBe('pending');
    await batchingService.runOnce(); // the honest path still works afterwards
    expect((await Order.findByPk(order.id))!.status).toBe('settled');
  });

  it('rejects callers without the validator API token', async () => {
    const url = `http://127.0.0.1:${(servers[0].address() as AddressInfo).port}`;
    const res = await fetch(`${url}/v1/decryption-shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batchId: 'x', ciphertexts: [] }),
    });
    expect(res.status).toBe(401);
    const wrong = new RemoteValidator({ index: 1, url, identityKey: ids[0].publicKey, apiToken: 'f'.repeat(64) });
    await expect(wrong.info()).rejects.toThrow(/401/);
    expect((await request(url).get('/health')).status).toBe(200);
  });

  it('keeps settling with n − t validators down', async () => {
    await new Promise((r) => servers[1].close(r));
    await new Promise((r) => servers[3].close(r));
    const res = await submitSwap(app, newUser());
    await batchingService.runOnce();
    expect((await Order.findByPk(res.body.order.id))!.status).toBe('settled');
  });

  it('fails orders cleanly (no plaintext revealed) when fewer than t validators are up', async () => {
    await new Promise((r) => servers[4].close(r));
    const res = await submitSwap(app, newUser());
    await batchingService.runOnce();
    const order = await Order.findByPk(res.body.order.id);
    expect(order!.status).toBe('failed');
    expect(order!.failure_reason).toMatch(/2\/3 valid decryption shares/);
    expect(order!.token_in).toBeNull();
  });
});
