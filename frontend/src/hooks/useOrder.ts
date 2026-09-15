import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Order } from '../types/order';
import { getErrorMessage } from '../utils/errors';

export const useUserOrders = (userAddress: string | null) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!userAddress) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/orders/user/${userAddress}`);
      setOrders(response.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders };
};
