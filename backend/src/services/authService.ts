import crypto from 'crypto';
import { Account, Keypair, Operation, StrKey, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { config } from '../config';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

/**
 * Wallet-signature auth, modelled on Stellar SEP-10.
 *
 * 1. challenge(address): the server builds a transaction whose source is the
 *    user's account, with sequence 0 (so it can never be submitted to the
 *    network) and a single manageData op carrying
 *    expiry[8] ‖ random[24] ‖ HMAC(secret, address ‖ expiry ‖ random)[32].
 *    The HMAC makes challenges stateless: only this server can mint them.
 * 2. The wallet (Freighter) signs that transaction with the account's key.
 * 3. verify(xdr): the server checks the HMAC, the expiry, and the ed25519
 *    signature over the transaction hash against the source account, then
 *    issues a short-lived HMAC session token for that address.
 */

const AUTH_DATA_NAME = 'cipher-protocol auth';
const CHALLENGE_TTL_S = 300;
const SESSION_TTL_S = 60 * 60;

const secret: Buffer = (() => {
  if (config.authTokenSecret) {
    if (config.authTokenSecret.length < 32) throw new Error('AUTH_TOKEN_SECRET must be at least 32 characters');
    return Buffer.from(config.authTokenSecret, 'utf8');
  }
  logger.warn('AUTH_TOKEN_SECRET not set — using a random per-process secret; sessions reset on restart');
  return crypto.randomBytes(32);
})();

const hmac = (...parts: (Buffer | string)[]) => {
  const h = crypto.createHmac('sha256', secret);
  for (const p of parts) h.update(p);
  return h.digest();
};

const nowS = () => Math.floor(Date.now() / 1000);

function assertAccountAddress(address: unknown): asserts address is string {
  if (typeof address !== 'string' || !StrKey.isValidEd25519PublicKey(address)) {
    throw new AppError('address must be a Stellar account address (G...)');
  }
}

export interface Session {
  address: string;
  expiresAt: number;
}

export const authService = {
  createChallenge(address: unknown) {
    assertAccountAddress(address);
    const expiry = Buffer.alloc(8);
    expiry.writeBigUInt64BE(BigInt(nowS() + CHALLENGE_TTL_S));
    const random = crypto.randomBytes(24);
    const value = Buffer.concat([expiry, random, hmac(address, expiry, random)]);

    const tx = new TransactionBuilder(new Account(address, '-1'), {
      fee: '100',
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(Operation.manageData({ name: AUTH_DATA_NAME, value }))
      .setTimeout(CHALLENGE_TTL_S)
      .build();

    return { transaction: tx.toXDR(), network_passphrase: config.networkPassphrase };
  },

  /** Verifies a signed challenge and returns a session token for its source account. */
  verifyChallenge(signedXdr: unknown): { token: string; address: string; expires_at: number } {
    if (typeof signedXdr !== 'string' || signedXdr.length > 4096) throw new AppError('transaction must be a string');

    let tx: Transaction;
    try {
      const parsed = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);
      if (!(parsed instanceof Transaction)) throw new Error('fee bump not allowed');
      tx = parsed;
    } catch {
      throw new AppError('invalid challenge transaction', 401);
    }

    const address = tx.source;
    const op = tx.operations[0];
    if (
      tx.sequence !== '0' ||
      tx.operations.length !== 1 ||
      op.type !== 'manageData' ||
      op.name !== AUTH_DATA_NAME ||
      !op.value ||
      op.value.length !== 64 ||
      (op.source && op.source !== address)
    ) {
      throw new AppError('not a Cipher Protocol challenge', 401);
    }

    const value = Buffer.from(op.value);
    const [expiry, random, mac] = [value.subarray(0, 8), value.subarray(8, 32), value.subarray(32)];
    if (!crypto.timingSafeEqual(mac, hmac(address, expiry, random))) {
      throw new AppError('challenge was not issued by this server', 401);
    }
    if (Number(expiry.readBigUInt64BE()) < nowS()) throw new AppError('challenge expired', 401);

    const keypair = Keypair.fromPublicKey(address);
    const hash = tx.hash();
    const signed = tx.signatures.some((decorated) => {
      const { hint, signature } = decorated.toXdrObject();
      return Buffer.from(hint).equals(keypair.signatureHint()) && keypair.verify(hash, Buffer.from(signature));
    });
    if (!signed) throw new AppError('challenge is not signed by the account it names', 401);

    return this.issueSession(address);
  },

  issueSession(address: string) {
    const expiresAt = nowS() + SESSION_TTL_S;
    const payload = Buffer.from(JSON.stringify({ a: address, e: expiresAt })).toString('base64url');
    const token = `${payload}.${hmac('session.', payload).toString('base64url')}`;
    return { token, address, expires_at: expiresAt };
  },

  /** Returns the session for a token, or null if it's forged, malformed, or expired. */
  verifySession(token: string): Session | null {
    const [payload, mac, extra] = token.split('.');
    if (!payload || !mac || extra !== undefined) return null;
    const expected = hmac('session.', payload);
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
      const { a, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (typeof a !== 'string' || typeof e !== 'number' || e < nowS()) return null;
      return { address: a, expiresAt: e };
    } catch {
      return null;
    }
  },
};
