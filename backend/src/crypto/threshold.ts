/**
 * Threshold side of the order cipher (validator-only; never shipped to the
 * browser). See orderCipher.ts for the encryption scheme.
 *
 *  - keygen:         t-of-n Shamir sharing of the group secret y.
 *  - partialDecrypt: validator i returns D_i = y_i·R with a Chaum–Pedersen
 *                    DLEQ proof that log_G(Y_i) = log_R(D_i), i.e. that it
 *                    used its real share and not garbage.
 *  - combine:        any t verified shares → K = Σ λ_i·D_i = y·R.
 *
 * Keygen here is a trusted dealer, which is fine for the simulated validator
 * set (one process plays every validator). A real deployment needs a DKG
 * (e.g. Pedersen/Feldman) so no dealer ever sees y — see
 * docs/THRESHOLD_ENCRYPTION.md.
 */
import { ristretto255 } from '@noble/curves/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, parsePoint, randomScalar } from './orderCipher';

const Point = ristretto255.Point;
type RistrettoPoint = InstanceType<typeof Point>;
const L = Point.Fn.ORDER;
const DLEQ_DOMAIN = new TextEncoder().encode('cipher-protocol/dleq/v1');

const mod = (a: bigint) => ((a % L) + L) % L;
const scalarToHex = (s: bigint) => s.toString(16).padStart(64, '0');
const hexToScalar = (h: string) => {
  const s = BigInt('0x' + h);
  if (s <= 0n || s >= L) throw new Error('scalar out of range');
  return s;
};

export interface KeyShare {
  /** 1-based share index (the x-coordinate of the Shamir share). */
  index: number;
  /** Secret share y_i, hex. Only the owning validator ever holds this. */
  secret: string;
  /** Verification key Y_i = y_i·G, hex. Public. */
  verificationKey: string;
}

export interface ThresholdKeySet {
  threshold: number;
  groupPublicKey: string;
  shares: KeyShare[];
}

export interface DecryptionShare {
  index: number;
  /** D_i = y_i·R, hex. */
  share: string;
  /** DLEQ proof (challenge c, response z), hex scalars. */
  proof: { c: string; z: string };
}

export function generateKeySet(threshold: number, total: number): ThresholdKeySet {
  if (!Number.isInteger(threshold) || !Number.isInteger(total) || threshold < 1 || threshold > total) {
    throw new Error(`invalid threshold ${threshold}-of-${total}`);
  }
  // f(x) = a_0 + a_1 x + … + a_{t-1} x^{t-1}, with a_0 = y the group secret.
  const coeffs = Array.from({ length: threshold }, () => randomScalar());
  const evalAt = (x: bigint) => coeffs.reduceRight((acc, a) => mod(acc * x + a), 0n);

  const shares: KeyShare[] = [];
  for (let i = 1; i <= total; i++) {
    const secret = evalAt(BigInt(i));
    shares.push({
      index: i,
      secret: scalarToHex(secret),
      verificationKey: Point.BASE.multiply(secret).toHex(),
    });
  }
  return { threshold, groupPublicKey: Point.BASE.multiply(coeffs[0]).toHex(), shares };
}

function challenge(...points: RistrettoPoint[]): bigint {
  const h = sha512.create().update(DLEQ_DOMAIN);
  for (const p of points) h.update(p.toBytes());
  const digest = h.digest();
  let n = 0n;
  for (let i = digest.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(digest[i]);
  return mod(n);
}

/** Validator i's contribution toward decrypting a ciphertext with ephemeral key R. */
export function partialDecrypt(share: KeyShare, R: Uint8Array): DecryptionShare {
  const y = hexToScalar(share.secret);
  const Rp = parsePoint(bytesToHex(R));
  const Yi = Point.BASE.multiply(y);
  const Di = Rp.multiply(y);

  const k = randomScalar();
  const A1 = Point.BASE.multiply(k);
  const A2 = Rp.multiply(k);
  const c = challenge(Point.BASE, Yi, Rp, Di, A1, A2);
  const z = mod(k + c * y);

  return { index: share.index, share: Di.toHex(), proof: { c: scalarToHex(c), z: scalarToHex(z) } };
}

/** Checks a DLEQ proof: D_i really is y_i·R for the y_i behind verificationKey. */
export function verifyDecryptionShare(ds: DecryptionShare, verificationKeyHex: string, R: Uint8Array): boolean {
  try {
    const Yi = parsePoint(verificationKeyHex);
    const Rp = parsePoint(bytesToHex(R));
    const Di = parsePoint(ds.share);
    const c = BigInt('0x' + ds.proof.c);
    const z = BigInt('0x' + ds.proof.z);
    if (c >= L || z <= 0n || z >= L) return false;
    // A1 = z·G − c·Y_i, A2 = z·R − c·D_i; proof is valid iff the recomputed challenge matches.
    const cNeg = mod(-c);
    const A1 = Point.BASE.multiply(z).add(cNeg === 0n ? Point.ZERO : Yi.multiply(cNeg));
    const A2 = Rp.multiply(z).add(cNeg === 0n ? Point.ZERO : Di.multiply(cNeg));
    return challenge(Point.BASE, Yi, Rp, Di, A1, A2) === c;
  } catch {
    return false;
  }
}

function modInverse(a: bigint): bigint {
  // L is prime → Fermat.
  let result = 1n;
  let base = mod(a);
  let e = L - 2n;
  while (e > 0n) {
    if (e & 1n) result = (result * base) % L;
    base = (base * base) % L;
    e >>= 1n;
  }
  return result;
}

/** Lagrange coefficient for share `i` evaluated at x = 0 over the index set. */
export function lagrangeAtZero(i: number, indices: number[]): bigint {
  let num = 1n;
  let den = 1n;
  for (const j of indices) {
    if (j === i) continue;
    num = mod(num * BigInt(j));
    den = mod(den * BigInt(j - i));
  }
  return mod(num * modInverse(den));
}

/** Combines ≥ threshold *already verified* shares into the shared point K = y·R. */
export function combineShares(shares: DecryptionShare[], threshold: number): Uint8Array {
  const unique = [...new Map(shares.map((s) => [s.index, s])).values()].slice(0, threshold);
  if (unique.length < threshold) {
    throw new Error(`need ${threshold} distinct decryption shares, got ${unique.length}`);
  }
  const indices = unique.map((s) => s.index);
  let K = Point.ZERO;
  for (const s of unique) {
    K = K.add(parsePoint(s.share).multiply(lagrangeAtZero(s.index, indices)));
  }
  return K.toBytes();
}

export { bytesToHex, hexToBytes };
