import crypto from 'crypto';

/**
 * Derives a 32-byte AES-256 key from an arbitrary-length string via SHA-256.
 * Naively slicing a hex string to 32 characters yields a 16-byte key, which
 * is wrong for aes-256-cbc (needs 32 bytes) and silently weakens it for
 * shorter inputs — hash instead so the key length is always correct.
 */
export function deriveAesKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}
