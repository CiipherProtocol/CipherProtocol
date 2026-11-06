import React, { createContext, useState, useEffect, useCallback } from 'react';
import { WalletKind, walletService } from '../services/wallet';
import { authService } from '../services/auth';

export interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  connecting: boolean;
  kind: WalletKind | null;
  error: string | null;
  connect: (which?: WalletKind) => Promise<void>;
  disconnect: () => void;
}

export const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [kind, setKind] = useState<WalletKind | null>(walletService.kind());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    walletService.getAddress().then((addr) => {
      if (!cancelled && addr) setAddress(addr);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (which: WalletKind = 'freighter') => {
    setConnecting(true);
    setError(null);
    try {
      authService.clear();
      const addr = await walletService.connect(which);
      setAddress(addr);
      setKind(which);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect wallet');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    authService.clear();
    walletService.disconnect();
    setAddress(null);
    setKind(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, isConnected: !!address, connecting, kind, error, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}
