import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { StrKey, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import {
  InMemoryCommitmentLedger,
  SorobanCommitmentLedger,
  assertBatchSealed,
  batchCommitment,
} from '../src/chain/batchCommitment';
import { createApp } from '../src/app';
import { sequelize } from '../src/db';
import { Order } from '../src/db/models/Order';
import { Batch } from '../src/db/models/Batch';
import { batchingService } from '../src/services/batchingService';
import { createLocalNetwork, setValidatorNetwork } from '../src/services/validatorNetwork';
import { validatorService } from '../src/services/validatorService';
import { newUser, submitSwap } from './helpers';

describe('batch commitment', () => {
  it('is deterministic, order-sensitive, and length-prefixed', () => {
    expect(batchCommitment(['a', 'b'])).toBe(batchCommitment(['a', 'b']));
    expect(batchCommitment(['a', 'b'])).not.toBe(batchCommitment(['b', 'a']));
    expect(batchCommitment(['ab', 'c'])).not.toBe(batchCommitment(['a', 'bc']));
    expect(batchCommitment([])).not.toBe(batchCommitment(['']));
    expect(batchCommitment(['x'])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('validator sealing check', () => {
  const ledger = new InMemoryCommitmentLedger();
  const id = crypto.randomUUID();
  const cts = ['ctp1.one', 'ctp1.two', 'ctp1.three'];
  ledger.record(id, cts.length, batchCommitment(cts));

  it('accepts exactly the sealed ciphertexts in the sealed order', async () => {
    await expect(assertBatchSealed(ledger, id, cts)).resolves.toMatchObject({ orderCount: 3 });
  });

  it.each([
    ['an unknown batch', crypto.randomUUID(), cts, /not committed on-chain/],
    ['a missing ciphertext', id, cts.slice(0, 2), /sealed with 3 orders/],
    ['an extra ciphertext', id, [...cts, 'ctp1.four'], /sealed with 3 orders/],
    ['a reordered batch', id, [cts[1], cts[0], cts[2]], /do not match/],
    ['a swapped-in ciphertext', id, ['ctp1.one', 'ctp1.EVIL', 'ctp1.three'], /do not match/],
  ])('refuses %s', async (_label, batchId, list, err) => {
    await expect(assertBatchSealed(ledger, batchId as string, list as string[])).rejects.toThrow(err as RegExp);
  });

  it('a batch id can only be sealed once', () => {
    expect(() => ledger.record(id, 1, batchCommitment(['x']))).toThrow(/already exists/);
  });
});

describe('reading commitments from order-vault (Soroban)', () => {
  const CONTRACT = 'CD6IHURX2DJIKYZLDD24VZTAL347NC6UUW5WYJEF6VJRCAYSULRWTNW4';

  /** Encodes a BatchAttestation the way the contract returns it (struct = sorted-key map). */
  function attestation(orderCount: number, hashHex: string, ts: number): xdr.ScVal {
    const entry = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v });
    return xdr.ScVal.scvMap([
      entry('content_hash', nativeToScVal(Buffer.from(hashHex, 'hex'), { type: 'bytes' })),
      entry('order_count', nativeToScVal(orderCount, { type: 'u32' })),
      entry('timestamp', nativeToScVal(ts, { type: 'u64' })),
    ]);
  }

  function fakeServer(retval: xdr.ScVal, seen: string[] = []) {
    return {
      async simulateTransaction(tx: { operations: { func: unknown }[] }) {
        const call = (tx.operations[0].func as {
          invokeContract: { contractAddress: { contractId: { toXdrObject(): Uint8Array } }; functionName: unknown };
        }).invokeContract;
        seen.push(StrKey.encodeContract(Buffer.from(call.contractAddress.contractId.toXdrObject())), String(call.functionName));
        return { result: { retval }, latestLedger: 1, events: [], id: '1', _parsed: true } as unknown as rpc.Api.SimulateTransactionSuccessResponse;
      },
    };
  }

  it('decodes a sealed batch record', async () => {
    const hash = batchCommitment(['a', 'b']);
    const seen: string[] = [];
    const ledger = new SorobanCommitmentLedger(CONTRACT, 'Test SDF Network ; September 2015', fakeServer(attestation(2, hash, 1700000000), seen));
    expect(await ledger.getBatch(crypto.randomUUID())).toEqual({ orderCount: 2, contentHash: hash, timestamp: 1700000000 });
    expect(seen).toEqual([CONTRACT, 'get_batch']);
  });

  it('returns null for a batch that was never sealed (Option::None)', async () => {
    const ledger = new SorobanCommitmentLedger(CONTRACT, 'Test SDF Network ; September 2015', fakeServer(xdr.ScVal.scvVoid()));
    expect(await ledger.getBatch(crypto.randomUUID())).toBeNull();
  });
});

describe('backend seals before decrypting', () => {
  const app = createApp();
  beforeEach(async () => {
    await sequelize.sync({ force: true });
    setValidatorNetwork(await createLocalNetwork({ count: 5, threshold: 3 }));
    await validatorService.syncValidatorRegistry();
  });
  afterAll(() => sequelize.close());

  it('records the commitment over the ordered ciphertexts on the batch', async () => {
    const a = await submitSwap(app, newUser());
    const b = await submitSwap(app, newUser());
    const batch = (await batchingService.runOnce())!;
    const saved = (await Batch.findByPk(batch.id))!;
    const orders = await Order.findAll({ where: { id: saved.order_ids } });
    const byId = new Map(orders.map((o) => [o.id, o.encrypted_data]));
    expect(saved.content_hash).toBe(batchCommitment(saved.order_ids.map((id) => byId.get(id)!)));
    expect(new Set(saved.order_ids)).toEqual(new Set([a.body.order.id, b.body.order.id]));
    expect((await Order.findByPk(a.body.order.id))!.status).toBe('settled');
  });

  it('a coordinator cannot decrypt a pending order without sealing it first', async () => {
    const res = await submitSwap(app, newUser());
    const order = (await Order.findByPk(res.body.order.id))!;
    const [outcome] = await validatorService.coordinateDecryption(crypto.randomUUID(), [order]);
    expect(outcome).toMatchObject({ ok: false, reason: expect.stringMatching(/0\/3 valid decryption shares/) });
  });

  it('a coordinator cannot slip an extra order into an already-sealed batch', async () => {
    await submitSwap(app, newUser());
    const sealed = (await batchingService.runOnce())!;
    const late = await submitSwap(app, newUser());
    const sealedOrders = await Order.findAll({ where: { id: sealed.order_ids } });
    const lateOrder = (await Order.findByPk(late.body.order.id))!;
    const outcomes = await validatorService.coordinateDecryption(sealed.id, [...sealedOrders, lateOrder]);
    expect(outcomes.every((o) => !o.ok)).toBe(true);
  });

  it('validators with no commitment ledger refuse to decrypt at all', async () => {
    const net = await createLocalNetwork({ count: 3, threshold: 2 });
    const bare = net.validators[0] as unknown as { opts: { commitments?: unknown } };
    bare.opts.commitments = undefined;
    await expect(net.validators[0].requestDecryptionShares(crypto.randomUUID(), [])).rejects.toThrow(/no commitment ledger/);
  });
});
