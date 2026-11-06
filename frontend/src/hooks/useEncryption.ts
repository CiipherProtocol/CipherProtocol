import { useCallback } from 'react';
import { api } from '../services/api';
import { encryptionService } from '../services/encryption';
import { SwapOrderInput } from '../types/order';

export interface ThresholdConfig {
  threshold_pubkey: string;
  threshold: number;
  validator_count: number;
}

export const useEncryption = () => {
  const encryptOrder = useCallback(async (order: SwapOrderInput) => {
    const { data: cfg } = await api.get<ThresholdConfig>('/config');
    const encrypted = await encryptionService.encrypt(JSON.stringify(order), cfg.threshold_pubkey, order.user);
    return { data: encrypted, pubkey: cfg.threshold_pubkey, threshold: cfg.threshold, validatorCount: cfg.validator_count };
  }, []);

  return { encryptOrder };
};
