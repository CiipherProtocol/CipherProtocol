import crypto from 'crypto';
import { Account, BASE_FEE, Contract, Keypair, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

/**
 * The on-chain commitment that seals a batch before anyone can decrypt it.
 *
 *   H = sha256( "cipher-protocol/batch-commitment/v1"
 *               ‖ u32be(n) ‖ for each ciphertext in settlement order: u32be(len) ‖ utf8 )
 *
 * Length-prefixed so ["ab","c"] and ["a","bc"] can't collide, and ordered
 * because order is what front-running exploits. The backend records
 * (n, H) via order-vault.create_batch; every validator independently reads it
 * back from chain and recomputes H over the ciphertexts it's asked to
 * decrypt, refusing on any mismatch.
 */
const DOMAIN = Buffer.from('cipher-protocol/batch-commitment/v1');

export function batchCommitment(ciphertexts: string[]): string {
  const h = crypto.createHash('sha256').update(DOMAIN);
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  h.update(u32(ciphertexts.length));
  for (const ct of ciphertexts) {
    const bytes = Buffer.from(ct, 'utf8');
    h.update(u32(bytes.length)).update(bytes);
  }
  return h.digest('hex');
}

export interface BatchRecord {
  orderCount: number;
  /** hex */
  contentHash: string;
  /** ledger timestamp (seconds) when the batch was sealed */
  timestamp: number;
}

/** Where validators read sealed-batch commitments from. */
export interface CommitmentLedger {
  readonly kind: 'soroban' | 'dev-in-memory';
  getBatch(batchId: string): Promise<BatchRecord | null>;
}

export function batchIdBytes(batchId: string): Buffer {
  const hex = batchId.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`batch id "${batchId}" is not a UUID`);
  return Buffer.from(hex, 'hex');
}

export function batchIdToScVal(batchId: string): xdr.ScVal {
  return nativeToScVal(batchIdBytes(batchId), { type: 'bytes' });
}

type Simulator = Pick<rpc.Server, 'simulateTransaction'>;

/**
 * Reads order-vault.get_batch through a read-only simulation: nothing is
 * signed or submitted, so validators need no Stellar account or funds.
 */
export class SorobanCommitmentLedger implements CommitmentLedger {
  readonly kind = 'soroban' as const;
  private readonly server: Simulator;

  constructor(
    private readonly contractId: string,
    private readonly networkPassphrase: string,
    rpcUrlOrServer: string | Simulator
  ) {
    this.server = typeof rpcUrlOrServer === 'string' ? new rpc.Server(rpcUrlOrServer) : rpcUrlOrServer;
  }

  async getBatch(batchId: string): Promise<BatchRecord | null> {
    // Simulation doesn't check the source account, so a throwaway one is fine.
    const source = new Account(Keypair.random().publicKey(), '0');
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(new Contract(this.contractId).call('get_batch', batchIdToScVal(batchId)))
      .setTimeout(30)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`get_batch simulation failed: ${sim.error}`);
    const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    const native = retval ? (scValToNative(retval) as Record<string, unknown> | null | undefined) : null;
    if (!native) return null;
    return {
      orderCount: Number(native.order_count),
      contentHash: Buffer.from(native.content_hash as Uint8Array).toString('hex'),
      timestamp: Number(native.timestamp),
    };
  }
}

/**
 * Stand-in for the chain when no ORDER_VAULT_CONTRACT is configured (local
 * dev, tests). It only means something when the validators reading it are
 * in the same process as the backend writing it — remote validators must
 * use SorobanCommitmentLedger.
 */
export class InMemoryCommitmentLedger implements CommitmentLedger {
  readonly kind = 'dev-in-memory' as const;
  private readonly batches = new Map<string, BatchRecord>();

  async getBatch(batchId: string) {
    return this.batches.get(batchId) ?? null;
  }

  record(batchId: string, orderCount: number, contentHash: string) {
    if (this.batches.has(batchId)) throw new Error('batch already exists'); // mirrors BatchAlreadyExists
    this.batches.set(batchId, { orderCount, contentHash, timestamp: Math.floor(Date.now() / 1000) });
  }
}

export const devCommitmentLedger = new InMemoryCommitmentLedger();

/**
 * The check every validator runs before releasing decryption shares: the
 * exact ordered ciphertext list must match what was sealed on-chain.
 */
export async function assertBatchSealed(ledger: CommitmentLedger, batchId: string, ciphertexts: string[]) {
  const record = await ledger.getBatch(batchId);
  if (!record) throw new Error(`batch ${batchId} is not committed on-chain; refusing to decrypt`);
  if (record.orderCount !== ciphertexts.length) {
    throw new Error(`batch ${batchId} was sealed with ${record.orderCount} orders, asked to decrypt ${ciphertexts.length}`);
  }
  if (record.contentHash !== batchCommitment(ciphertexts)) {
    throw new Error(`ciphertexts do not match batch ${batchId}'s on-chain commitment; refusing to decrypt`);
  }
  return record;
}
