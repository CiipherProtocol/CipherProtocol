import {
  isConnected as freighterIsConnected,
  requestAccess,
  getPublicKey,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';

export const walletService = {
  async isAvailable(): Promise<boolean> {
    return freighterIsConnected();
  },

  async connect(): Promise<string> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Freighter wallet not installed');
    }
    return requestAccess();
  },

  async getAddress(): Promise<string | null> {
    try {
      const available = await this.isAvailable();
      if (!available) return null;
      return await getPublicKey();
    } catch {
      return null;
    }
  },

  async signTransaction(xdr: string, networkPassphrase: string, accountToSign?: string): Promise<string> {
    return freighterSignTransaction(xdr, { networkPassphrase, accountToSign });
  },
};
