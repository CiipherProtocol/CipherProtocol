import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Batch, BatchStatsSummary } from '../types/batch';
import { BATCH_POLL_INTERVAL_MS } from '../constants/config';

export const useBatches = (enabled = true) => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stats, setStats] = useState<BatchStatsSummary>({
    total: 0,
    pending: 0,
    settled: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchBatches = useCallback(async () => {
    try {
      const response = await api.get('/batches');
      const data: Batch[] = response.data;

      setBatches(data);
      setStats({
        total: data.length,
        pending: data.filter((b) => b.status === 'created' || b.status === 'submitted').length,
        settled: data.filter((b) => b.status === 'settled').length,
      });
    } catch (error) {
      console.error('Failed to fetch batches:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
    if (!enabled) return;
    const interval = setInterval(fetchBatches, BATCH_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBatches, enabled]);

  return { batches, stats, loading, refetch: fetchBatches };
};
