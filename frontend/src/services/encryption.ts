/**
 * PLACEHOLDER encryption. This base64-encodes the order payload; it provides
 * no confidentiality. It exists only to keep the submit → batch → settle
 * pipeline wired end-to-end. Replace with real threshold ECIES (matching the
 * scheme the validator set implements) before any order data is sensitive.
 */
export const encryptionService = {
  encrypt(data: string, _pubkey: string): string {
    return btoa(data);
  },
};
