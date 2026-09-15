import React, { createContext, useState, useEffect, useCallback } from 'react';
import { walletService } from '../services/wallet';

export interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    walletService.getAddress().then((addr) => {
      if (!cancelled && addr) setAddress(addr);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const addr = await walletService.connect();
      setAddress(addr);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, isConnected: !!address, connecting, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}
