import { KeyShare, Point, mod, scalarToHex } from '../../src/crypto/threshold';
import { randomScalar } from '../../src/crypto/orderCipher';

/**
 * Trusted-dealer Shamir sharing — TEST FIXTURE ONLY. Production keys come
 * from the DKG (src/crypto/dkg.ts); this exists so the threshold math can be
 * unit-tested independently of the DKG protocol.
 */
export function dealKeySet(threshold: number, total: number) {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > total) {
    throw new Error(`invalid threshold ${threshold}-of-${total}`);
  }
  const coeffs = Array.from({ length: threshold }, () => randomScalar());
  const evalAt = (x: bigint) => coeffs.reduceRight((acc, a) => mod(acc * x + a), 0n);
  const shares: KeyShare[] = [];
  for (let i = 1; i <= total; i++) {
    const secret = evalAt(BigInt(i));
    shares.push({ index: i, secret: scalarToHex(secret), verificationKey: Point.BASE.multiply(secret).toHex() });
  }
  return { threshold, groupPublicKey: Point.BASE.multiply(coeffs[0]).toHex(), shares };
}
