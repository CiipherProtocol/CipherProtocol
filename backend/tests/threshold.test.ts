import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { decryptWithSharedPoint, encryptOrder, parseCiphertext } from '../src/crypto/orderCipher';
import {
  combineShares,
  generateKeySet,
  lagrangeAtZero,
  partialDecrypt,
  verifyDecryptionShare,
} from '../src/crypto/threshold';

const USER = 'GBUSERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

describe('threshold order cipher', () => {
  const keys = generateKeySet(3, 5);

  async function sealed(msg = '{"swap":1}') {
    const ct = await encryptOrder(msg, keys.groupPublicKey, USER);
    return { ct, R: parseCiphertext(ct).R };
  }

  it('any threshold-sized subset of validators decrypts', async () => {
    const { ct, R } = await sealed();
    for (const subset of [[0, 1, 2], [2, 3, 4], [4, 0, 2], [1, 3, 4]]) {
      const shares = subset.map((i) => partialDecrypt(keys.shares[i], R));
      expect(await decryptWithSharedPoint(ct, combineShares(shares, 3), USER)).toBe('{"swap":1}');
    }
  });

  it('fewer than threshold shares cannot be combined', async () => {
    const { R } = await sealed();
    const two = [0, 1].map((i) => partialDecrypt(keys.shares[i], R));
    expect(() => combineShares(two, 3)).toThrow(/need 3/);
    // Duplicate shares from one validator don't count twice.
    expect(() => combineShares([two[0], two[0], two[1]], 3)).toThrow(/need 3/);
  });

  it('a share computed as if threshold were 2 yields the wrong key', async () => {
    const { ct, R } = await sealed();
    const two = [0, 1].map((i) => partialDecrypt(keys.shares[i], R));
    await expect(decryptWithSharedPoint(ct, combineShares(two, 2), USER)).rejects.toThrow();
  });

  it('DLEQ proofs accept honest shares and reject substituted ones', async () => {
    const { R } = await sealed();
    const other = await sealed();
    const honest = partialDecrypt(keys.shares[0], R);
    expect(verifyDecryptionShare(honest, keys.shares[0].verificationKey, R)).toBe(true);
    // Right proof, wrong validator key.
    expect(verifyDecryptionShare(honest, keys.shares[1].verificationKey, R)).toBe(false);
    // Share for a different ciphertext replayed against this one.
    expect(verifyDecryptionShare(partialDecrypt(keys.shares[0], other.R), keys.shares[0].verificationKey, R)).toBe(false);
    // Share point swapped for another validator's.
    const swapped = { ...honest, share: partialDecrypt(keys.shares[1], R).share };
    expect(verifyDecryptionShare(swapped, keys.shares[0].verificationKey, R)).toBe(false);
    // Malformed input never throws, just fails.
    expect(verifyDecryptionShare({ ...honest, share: 'zz' }, keys.shares[0].verificationKey, R)).toBe(false);
  });

  it('ciphertext is bound to the submitting user address', async () => {
    const { ct, R } = await sealed();
    const K = combineShares([0, 1, 2].map((i) => partialDecrypt(keys.shares[i], R)), 3);
    await expect(decryptWithSharedPoint(ct, K, 'GSOMEONEELSE')).rejects.toThrow();
  });

  it('detects tampering with any byte of the ciphertext', async () => {
    const { ct, R } = await sealed();
    const K = combineShares([0, 1, 2].map((i) => partialDecrypt(keys.shares[i], R)), 3);
    const body = ct.slice('ctp1.'.length);
    const i = body.length - 5;
    const flipped = 'ctp1.' + body.slice(0, i) + (body[i] === 'A' ? 'B' : 'A') + body.slice(i + 1);
    await expect(decryptWithSharedPoint(flipped, K, USER)).rejects.toThrow();
  });

  it('encryption is randomized', async () => {
    expect((await sealed()).ct).not.toBe((await sealed()).ct);
  });

  it('rejects malformed ciphertexts and identity points', () => {
    expect(() => parseCiphertext('base64:abc')).toThrow(/version/);
    expect(() => parseCiphertext('ctp1.AAAA')).toThrow(/short/);
    expect(() => parseCiphertext('ctp1.' + 'A'.repeat(80))).toThrow(); // R = identity
  });

  it('Lagrange coefficients at zero sum to 1 (interpolate the constant 1)', () => {
    const L = 2n ** 252n + 27742317777372353535851937790883648493n;
    const idx = [1, 3, 5];
    const sum = idx.reduce((acc, i) => (acc + lagrangeAtZero(i, idx)) % L, 0n);
    expect(sum).toBe(1n);
  });

  it('rejects invalid threshold parameters', () => {
    expect(() => generateKeySet(0, 3)).toThrow();
    expect(() => generateKeySet(4, 3)).toThrow();
  });

  it('frontend ships a byte-identical copy of the cipher', () => {
    const backend = fs.readFileSync(path.join(__dirname, '../src/crypto/orderCipher.ts'), 'utf8');
    const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/crypto/orderCipher.ts'), 'utf8');
    expect(frontend).toBe(backend);
  });
});
