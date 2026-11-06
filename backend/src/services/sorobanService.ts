import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { config } from '../config';
import { batchCommitment, batchIdToScVal, devCommitmentLedger } from '../chain/batchCommitment';
import { DecryptedOrder } from '../types/order';
import { SettlementResult } from '../types/settlement';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

const server = new rpc.Server(config.sorobanRpcUrl);

function getSignerKeypair(): Keypair {
  if (!config.backendSignerSecret) {
    throw new AppError('BACKEND_SIGNER_SECRET is not configured', 500);
  }
  return Keypair.fromSecret(config.backendSignerSecret);
}

function resolveTokenAddress(symbol: string): string {
  const address = config.tokenContracts[symbol];
  if (!address) {
    throw new AppError(`No contract address configured for token "${symbol}"`, 500);
  }
  return address;
}

/** Soroban structs serialize as a map of Symbol(field name) -> value, keys sorted. */
function scMap(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  const entries = Object.keys(fields)
    .sort()
    .map(
      (key) =>
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol(key),
          val: fields[key],
        })
    );
  return xdr.ScVal.scvMap(entries);
}

function decryptedOrderToScVal(order: DecryptedOrder): xdr.ScVal {
  return scMap({
    user: new Address(order.user).toScVal(),
    token_in: new Address(resolveTokenAddress(order.token_in)).toScVal(),
    token_out: new Address(resolveTokenAddress(order.token_out)).toScVal(),
    amount_in: nativeToScVal(BigInt(order.amount_in), { type: 'i128' }),
    min_amount_out: nativeToScVal(BigInt(order.min_amount_out), { type: 'i128' }),
  });
}

/** Same shape TokenClient.transfer's ScVal decodes to for a struct — used to
 * turn settle_batch's returned SettlementResult vec back into plain JS. */
function nativeSettlementResult(value: unknown): SettlementResult {
  const record = value as Record<string, unknown>;
  return {
    user: String(record.user),
    token_in: String(record.token_in),
    token_out: String(record.token_out),
    amount_in: String(record.amount_in),
    amount_out: String(record.amount_out),
    fee: String(record.fee),
  };
}

async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<{ value: unknown; txHash: string }> {
  const signer = getSignerKeypair();
  const account = await server.getAccount(signer.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(signer);

  const sendResult = await server.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new AppError(`${method} submission failed: ${JSON.stringify(sendResult.errorResult)}`, 502);
  }

  let getResult = await server.getTransaction(sendResult.hash);
  const deadline = Date.now() + 30_000;
  while (getResult.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    if (Date.now() > deadline) {
      throw new AppError(`${method} timed out waiting for confirmation (${sendResult.hash})`, 504);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    getResult = await server.getTransaction(sendResult.hash);
  }

  if (getResult.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new AppError(`${method} failed on-chain: ${getResult.status}`, 502);
  }

  return { value: getResult.returnValue ? scValToNative(getResult.returnValue) : undefined, txHash: sendResult.hash };
}

export const sorobanService = {
  getServer(): rpc.Server {
    return server;
  },

  /**
   * Seals a batch on-chain: records the commitment to its ordered
   * ciphertexts in order-vault. Validators check this record themselves
   * before releasing any decryption share, so this must happen first.
   */
  async createBatch(batchId: string, ciphertexts: string[]): Promise<{ contentHash: string; txHash: string | null }> {
    const contentHash = batchCommitment(ciphertexts);
    if (!config.orderVaultContract) {
      logger.warn(
        `[sorobanService] ORDER_VAULT_CONTRACT unset — sealing batch ${batchId} in the in-memory dev ledger (in-process validators only)`
      );
      devCommitmentLedger.record(batchId, ciphertexts.length, contentHash);
      return { contentHash, txHash: null };
    }

    const { txHash } = await invokeContract(config.orderVaultContract, 'create_batch', [
      batchIdToScVal(batchId),
      nativeToScVal(ciphertexts.length, { type: 'u32' }),
      nativeToScVal(Buffer.from(contentHash, 'hex'), { type: 'bytes' }),
    ]);
    return { contentHash, txHash };
  },

  async settleBatch(batchId: string, decryptedOrders: DecryptedOrder[]): Promise<SettlementResult[]> {
    if (!config.settlementEngineContract) {
      logger.warn(
        `[sorobanService] SETTLEMENT_ENGINE_CONTRACT unset — returning zero-amount stub results for batch ${batchId}`
      );
      return decryptedOrders.map((order) => ({
        user: order.user,
        token_in: order.token_in,
        token_out: order.token_out,
        amount_in: order.amount_in,
        amount_out: '0',
        fee: '0',
      }));
    }

    const ordersScVal = xdr.ScVal.scvVec(decryptedOrders.map(decryptedOrderToScVal));

    const { value: raw } = await invokeContract(config.settlementEngineContract, 'settle_batch', [
      batchIdToScVal(batchId),
      ordersScVal,
    ]);

    return (raw as unknown[]).map(nativeSettlementResult);
  },
};
