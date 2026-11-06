import { Validator } from '../db/models/Validator';
import { Order } from '../db/models/Order';
import { decryptWithSharedPoint, parseCiphertext } from '../crypto/orderCipher';
import { DecryptionShare, combineShares, verifyDecryptionShare } from '../crypto/threshold';
import { DecryptedOrder } from '../types/order';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';
import { getValidatorNetwork, initValidatorNetwork } from './validatorNetwork';

export type DecryptionOutcome =
  | { orderId: string; ok: true; order: DecryptedOrder }
  | { orderId: string; ok: false; reason: string };

const INTEGER = /^[1-9][0-9]{0,37}$/; // positive i128-safe base-unit amount
const SYMBOL = /^[A-Z0-9]{1,12}$/;

/**
 * Parses and sanity-checks a decrypted payload. The ciphertext is only
 * authenticated, not trusted: the user chose its contents, so everything
 * the settlement contract will act on is validated here.
 */
export function parseDecryptedOrder(plaintext: string, expectedUser: string, expectedNonce: number): DecryptedOrder {
  const raw = JSON.parse(plaintext) as Record<string, unknown>;
  const str = (k: string) => {
    if (typeof raw[k] !== 'string') throw new Error(`decrypted order missing ${k}`);
    return raw[k] as string;
  };
  const order: DecryptedOrder = {
    user: str('user'),
    token_in: str('token_in'),
    token_out: str('token_out'),
    amount_in: str('amount_in'),
    min_amount_out: str('min_amount_out'),
  };
  if (order.user !== expectedUser) throw new Error('decrypted order is for a different user');
  if (raw.nonce !== expectedNonce) throw new Error('decrypted nonce does not match submitted nonce');
  if (!SYMBOL.test(order.token_in) || !SYMBOL.test(order.token_out)) throw new Error('invalid token symbol');
  if (order.token_in === order.token_out) throw new Error('token_in and token_out must differ');
  if (!INTEGER.test(order.amount_in)) throw new Error('amount_in must be a positive integer in base units');
  if (order.min_amount_out !== '0' && !INTEGER.test(order.min_amount_out)) {
    throw new Error('min_amount_out must be a non-negative integer in base units');
  }
  return order;
}

export const validatorService = {
  /**
   * Mirrors the (simulated) validator set into the DB so the public share of
   * each validator is inspectable via the API, and so share verification
   * uses the registered verification keys rather than whatever a validator
   * claims about itself.
   */
  async syncValidatorRegistry() {
    const { validators, verificationKeys } = await initValidatorNetwork();
    for (const v of validators) {
      const verificationKey = verificationKeys[v.index];
      const [row] = await Validator.findOrCreate({
        where: { address: v.address },
        defaults: { address: v.address, public_share: verificationKey, status: 'active' },
      });
      if (row.public_share !== verificationKey) {
        await row.update({ public_share: verificationKey, status: 'active' });
      }
    }
  },

  async getActiveValidators() {
    return Validator.findAll({ where: { status: 'active' } });
  },

  getPublicKeyInfo() {
    const net = getValidatorNetwork();
    return {
      threshold_pubkey: net.groupPublicKey,
      threshold: net.threshold,
      validator_count: net.validators.length,
      scheme: 'ristretto255-elgamal-kem+hkdf-sha256+aes-256-gcm',
    };
  },

  /**
   * Threshold-decrypts every order in a batch. Each validator is asked for
   * shares for the whole batch at once (so decryption only begins after the
   * batch — and therefore the ordering — is fixed). Every share's DLEQ proof
   * is checked against that validator's registered verification key; bad
   * shares are dropped, and any `threshold` good ones suffice.
   *
   * One bad order (tampered ciphertext, wrong user, malformed payload) fails
   * on its own and does not block the rest of the batch.
   */
  async coordinateDecryption(batchId: string, orders: Order[]): Promise<DecryptionOutcome[]> {
    const net = getValidatorNetwork();
    const registered = new Map(
      (await this.getActiveValidators()).map((v) => [v.address, v.public_share])
    );
    const ciphertexts = orders.map((o) => o.encrypted_data);

    const responses = await Promise.allSettled(
      net.validators.map(async (v) => ({ v, shares: await v.requestDecryptionShares(batchId, ciphertexts) }))
    );

    // validShares[k] = verified shares for orders[k]
    const validShares: DecryptionShare[][] = orders.map(() => []);
    for (const res of responses) {
      if (res.status === 'rejected') {
        logger.warn(`[batch ${batchId}] validator unreachable: ${getErrorMessage(res.reason)}`);
        continue;
      }
      const { v, shares } = res.value;
      const vk = registered.get(v.address);
      if (!vk) {
        logger.warn(`[batch ${batchId}] ignoring unregistered validator ${v.address}`);
        continue;
      }
      shares.forEach((share, k) => {
        if (share?.index !== v.index) return;
        let R: Uint8Array;
        try {
          R = parseCiphertext(ciphertexts[k]).R;
        } catch {
          return;
        }
        if (verifyDecryptionShare(share, vk, R)) {
          validShares[k].push(share);
        } else {
          logger.warn(`[batch ${batchId}] rejected invalid decryption share from ${v.address} (order ${orders[k].id})`);
        }
      });
    }

    return Promise.all(
      orders.map(async (order, k): Promise<DecryptionOutcome> => {
        try {
          if (validShares[k].length < net.threshold) {
            throw new Error(`only ${validShares[k].length}/${net.threshold} valid decryption shares`);
          }
          const K = combineShares(validShares[k], net.threshold);
          const plaintext = await decryptWithSharedPoint(order.encrypted_data, K, order.user_address);
          return { orderId: order.id, ok: true, order: parseDecryptedOrder(plaintext, order.user_address, Number(order.nonce)) };
        } catch (err) {
          const reason =
            err instanceof Error && err.name === 'OperationError'
              ? 'ciphertext failed authentication'
              : getErrorMessage(err);
          return { orderId: order.id, ok: false, reason };
        }
      })
    );
  },
};
