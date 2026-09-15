import crypto from 'crypto';
import { deriveAesKey } from '../utils/crypto';

/**
 * PLACEHOLDER symmetric encryption standing in for real threshold ECIES.
 * A single holder of `decryptionKey` can decrypt alone, which defeats the
 * "no single validator can decrypt" design goal — replace before any order
 * data here is sensitive. Kept only to exercise the submit → batch → settle
 * pipeline end-to-end.
 */
export const encryptionService = {
  encryptOrder(order: unknown, thresholdPubkey: string): string {
    const orderJson = JSON.stringify(order);
    const key = deriveAesKey(thresholdPubkey);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    const encrypted = Buffer.concat([cipher.update(orderJson, 'utf8'), cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  },

  decryptOrder(encryptedData: string, decryptionKey: string): unknown {
    const [ivHex, encryptedHex] = encryptedData.split(':');
    if (!ivHex || !encryptedHex) {
      throw new Error('Malformed encrypted_data');
    }

    const key = deriveAesKey(decryptionKey);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  },
};
