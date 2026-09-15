import { useCallback } from 'react';
import { api } from '../services/api';
import { encryptionService } from '../services/encryption';
import { SwapOrderInput } from '../types/order';

export const useEncryption = () => {
  const encryptOrder = useCallback(async (order: SwapOrderInput) => {
    const response = await api.get('/config');
    const thresholdPubkey: string = response.data.threshold_pubkey;

    const encrypted = encryptionService.encrypt(JSON.stringify(order), thresholdPubkey);

    return {
      data: encrypted,
      pubkey: thresholdPubkey,
    };
  }, []);

  return { encryptOrder };
};
