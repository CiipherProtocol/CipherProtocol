import {
  isConnected as freighterIsConnected,
  requestAccess,
  getPublicKey,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

export type WalletKind = 'freighter' | 'demo';

const KIND_KEY = 'cipher-protocol:wallet-kind';
const DEMO_KEY = 'cipher-protocol:demo-secret';

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // storage unavailable — the demo wallet just won't survive a reload
  }
}

let kind: WalletKind | null = (read(KIND_KEY) as WalletKind | null) ?? null;
let demoKeypair: Keypair | null = (() => {
  const secret = read(DEMO_KEY);
  try {
    return secret ? Keypair.fromSecret(secret) : null;
  } catch {
    return null;
  }
})();

/**
 * Two ways to sign:
 *  - Freighter (the real wallet), or
 *  - a throwaway demo key generated in this tab, so reviewers can try the
 *    full encrypt → seal → threshold-decrypt flow without installing a
 *    wallet. It's only ever used to sign the sign-in challenge (a
 *    sequence-0 transaction that can't be submitted), holds no funds, and
 *    is discarded when the tab closes or the user disconnects.
 */
export const walletService = {
  kind(): WalletKind | null {
    return kind;
  },

  async isFreighterAvailable(): Promise<boolean> {
    try {
      return await freighterIsConnected();
    } catch {
      return false;
    }
  },

  async connect(which: WalletKind = 'freighter'): Promise<string> {
    if (which === 'demo') {
      demoKeypair = Keypair.random();
      write(DEMO_KEY, demoKeypair.secret());
      kind = 'demo';
      write(KIND_KEY, kind);
      return demoKeypair.publicKey();
    }
    if (!(await this.isFreighterAvailable())) {
      throw new Error('Freighter is not installed. Install it, or try the demo wallet.');
    }
    const address = await requestAccess();
    if (!address) throw new Error('Freighter did not share an address');
    kind = 'freighter';
    write(KIND_KEY, kind);
    return address;
  },

  disconnect() {
    kind = null;
    demoKeypair = null;
    write(KIND_KEY, null);
    write(DEMO_KEY, null);
  },

  /** The address to restore on page load, if the user was connected in this tab. */
  async getAddress(): Promise<string | null> {
    if (kind === 'demo') return demoKeypair?.publicKey() ?? null;
    if (kind === 'freighter') {
      try {
        return (await this.isFreighterAvailable()) ? await getPublicKey() : null;
      } catch {
        return null;
      }
    }
    return null;
  },

  async signTransaction(xdr: string, networkPassphrase: string, accountToSign?: string): Promise<string> {
    if (kind === 'demo') {
      if (!demoKeypair) throw new Error('demo wallet not initialised');
      const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
      tx.sign(demoKeypair);
      return tx.toXDR();
    }
    return freighterSignTransaction(xdr, { networkPassphrase, accountToSign });
  },
};
