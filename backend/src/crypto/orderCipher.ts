/**
 * Order encryption: ElGamal KEM over ristretto255 + AES-256-GCM.
 *
 * This file is environment-neutral (WebCrypto + @noble/curves only) and is
 * kept BYTE-IDENTICAL in backend/src/crypto/orderCipher.ts and
 * frontend/src/crypto/orderCipher.ts — a backend test enforces that, so the
 * browser and the validators can never drift on the wire format.
 *
 * Scheme (Y = group public key whose secret y is Shamir-shared among the
 * validators; nobody holds y itself):
 *
 *   r  <- random scalar
 *   R  =  r·G                      (sent with the ciphertext)
 *   K  =  r·Y                      (shared point; equals y·R)
 *   k  =  HKDF-SHA256(ikm = R‖K, salt = "cipher-protocol", info = INFO)
 *   ct =  AES-256-GCM(k, nonce, plaintext, aad = R‖utf8(userAddress))
 *
 * Decrypting needs K = y·R, which validators compute *jointly*: each returns
 * y_i·R plus a proof, and any `threshold` of them combine via Lagrange
 * interpolation in the exponent (see threshold.ts). Binding the user's
 * address into the AAD means a ciphertext copied into someone else's order
 * fails authentication instead of executing under their account.
 *
 * Wire format: "ctp1." + base64url(R[32] ‖ nonce[12] ‖ ciphertext‖tag)
 */
import { ristretto255 } from '@noble/curves/ed25519';

const Point = ristretto255.Point;
const L = Point.Fn.ORDER;

export const CIPHER_PREFIX = 'ctp1.';
const POINT_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const enc = new TextEncoder();
const HKDF_SALT = enc.encode('cipher-protocol');
const HKDF_INFO = enc.encode('cipher-protocol/order-cipher/v1');

export interface ParsedCiphertext {
  R: Uint8Array;
  nonce: Uint8Array;
  body: Uint8Array;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('invalid base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Copy into a fresh ArrayBuffer-backed array (WebCrypto's BufferSource typing). */
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

/** Uniform non-zero scalar mod the ristretto255 group order (64 bytes reduced → negligible bias). */
export function randomScalar(): bigint {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(64));
    let n = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
    n %= L;
    if (n !== 0n) return n;
  }
}

type AesKey = Awaited<ReturnType<typeof crypto.subtle.deriveKey>>;

async function deriveAesKey(R: Uint8Array, K: Uint8Array): Promise<AesKey> {
  const ikm = await crypto.subtle.importKey('raw', buf(concat(R, K)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(HKDF_SALT), info: buf(HKDF_INFO) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function aad(R: Uint8Array, userAddress: string): Uint8Array<ArrayBuffer> {
  return buf(concat(R, enc.encode(userAddress)));
}

/** Validates and decodes a hex-encoded ristretto255 point (rejects identity). */
export function parsePoint(hex: string) {
  const point = Point.fromHex(hex);
  if (point.equals(Point.ZERO)) throw new Error('identity point not allowed');
  return point;
}

export async function encryptOrder(
  plaintext: string,
  groupPublicKeyHex: string,
  userAddress: string
): Promise<string> {
  const Y = parsePoint(groupPublicKeyHex);
  const r = randomScalar();
  const R = Point.BASE.multiply(r).toBytes();
  const K = Y.multiply(r).toBytes();
  const key = await deriveAesKey(R, K);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const body = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad(R, userAddress) },
      key,
      buf(enc.encode(plaintext))
    )
  );
  return CIPHER_PREFIX + base64UrlEncode(concat(R, nonce, body));
}

export function parseCiphertext(ciphertext: string): ParsedCiphertext {
  if (!ciphertext.startsWith(CIPHER_PREFIX)) throw new Error('unsupported ciphertext version');
  const raw = base64UrlDecode(ciphertext.slice(CIPHER_PREFIX.length));
  if (raw.length < POINT_BYTES + NONCE_BYTES + TAG_BYTES) throw new Error('ciphertext too short');
  const R = raw.slice(0, POINT_BYTES);
  parsePoint(bytesToHex(R)); // reject malformed / identity R up front
  return {
    R,
    nonce: raw.slice(POINT_BYTES, POINT_BYTES + NONCE_BYTES),
    body: raw.slice(POINT_BYTES + NONCE_BYTES),
  };
}

/**
 * Opens a ciphertext given the shared point K = y·R (as combined from
 * validator shares). Throws if K is wrong, the ciphertext was tampered
 * with, or it was bound to a different user address.
 */
export async function decryptWithSharedPoint(
  ciphertext: string,
  sharedPoint: Uint8Array,
  userAddress: string
): Promise<string> {
  const { R, nonce, body } = parseCiphertext(ciphertext);
  const key = await deriveAesKey(R, sharedPoint);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf(nonce), additionalData: aad(R, userAddress) },
    key,
    buf(body)
  );
  return new TextDecoder().decode(plain);
}
