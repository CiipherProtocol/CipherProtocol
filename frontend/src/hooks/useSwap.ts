import { useState } from 'react';
import { api } from '../services/api';
import { EncryptedOrderPayload, Order } from '../types/order';
import { getErrorMessage } from '../utils/errors';

export const useSwap = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitOrder = async (orderData: EncryptedOrderPayload): Promise<Order> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/orders', orderData, {
        headers: { 'x-user-address': orderData.user },
      });
      return response.data.order as Order;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { submitOrder, loading, error };
};
