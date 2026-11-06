import { useEffect, useState } from 'react';
import { api } from '../services/api';

export interface NetworkConfig {
  threshold_pubkey: string;
  threshold: number;
  validator_count: number;
  sealing: 'onchain' | 'dev-ledger';
  order_vault_contract: string | null;
  settlement: 'onchain' | 'simulated';
  validator_mode: 'local' | 'remote';
}

/** The backend's self-reported mode: what's really on-chain and what's simulated. */
export function useNetworkConfig() {
  const [config, setConfig] = useState<NetworkConfig | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<NetworkConfig>('/config')
      .then(({ data }) => !cancelled && setConfig(data))
      .catch(() => !cancelled && setUnreachable(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, unreachable };
}
