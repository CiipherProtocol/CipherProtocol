/**
 * Validator identity signatures (ed25519). Once validators talk over a
 * network, the coordinator routing their messages is untrusted: without
 * signatures it could swap in its own DKG transport key for a validator,
 * forge complaints to force public share reveals, or forge broadcasts.
 * Every DKG message is therefore signed by its sender's long-term
 * identity key and checked by every recipient.
 */
import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from './orderCipher';

export interface Signed<T> {
  payload: T;
  signer: number;
  signature: string;
}

export interface Identity {
  secretKey: string;
  publicKey: string;
}

/** Deterministic JSON (recursively sorted keys) so signer and verifier hash the same bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const message = (domain: string, signer: number, payload: unknown) =>
  new TextEncoder().encode(`cipher-protocol/${domain}\n${signer}\n${canonicalJson(payload)}`);

export function generateIdentity(): Identity {
  const secret = ed25519.utils.randomPrivateKey();
  return { secretKey: bytesToHex(secret), publicKey: bytesToHex(ed25519.getPublicKey(secret)) };
}

export function publicKeyOf(secretKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(secretKeyHex)));
}

export function signPayload<T>(domain: string, payload: T, signer: number, secretKeyHex: string): Signed<T> {
  const signature = ed25519.sign(message(domain, signer, payload), hexToBytes(secretKeyHex));
  return { payload, signer, signature: bytesToHex(signature) };
}

export function verifySigned(domain: string, signed: Signed<unknown>, publicKeyHex: string | undefined): boolean {
  if (!publicKeyHex || !signed || typeof signed.signature !== 'string' || !Number.isInteger(signed.signer)) return false;
  try {
    return ed25519.verify(hexToBytes(signed.signature), message(domain, signed.signer, signed.payload), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}
