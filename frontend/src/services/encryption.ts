import { encryptOrder } from '../crypto/orderCipher';

/**
 * Encrypts an order to the validator set's threshold public key (ElGamal KEM
 * over ristretto255 + AES-256-GCM — see crypto/orderCipher.ts). The result
 * can only be opened by `threshold` validators cooperating; the backend and
 * any single validator learn nothing from it. Bound to `userAddress`, so it
 * can't be replayed under another account.
 */
export const encryptionService = {
  encrypt(plaintext: string, thresholdPubkey: string, userAddress: string): Promise<string> {
    return encryptOrder(plaintext, thresholdPubkey, userAddress);
  },
};
