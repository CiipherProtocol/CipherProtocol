import React, { createContext, useState, useEffect } from 'react';

export interface PriceContextType {
  prices: Record<string, number>;
}

export const PriceContext = createContext<PriceContextType>({ prices: {} });

// Placeholder: static prices until a real price feed/oracle is wired up.
const MOCK_PRICES: Record<string, number> = {
  USDC: 1,
  USDT: 1,
  XLM: 0.1,
};

export function PriceProvider({ children }: { children: React.ReactNode }) {
  const [prices, setPrices] = useState<Record<string, number>>(MOCK_PRICES);

  useEffect(() => {
    setPrices(MOCK_PRICES);
  }, []);

  return <PriceContext.Provider value={{ prices }}>{children}</PriceContext.Provider>;
}
