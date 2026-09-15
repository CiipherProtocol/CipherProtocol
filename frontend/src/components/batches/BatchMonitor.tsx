import { useState } from 'react';
import { useBatches } from '../../hooks/useBatches';
import { formatTimestamp } from '../../utils/formatting';
import Loading from '../common/Loading';
import BatchStats from './BatchStats';

const STATUS_TEXT_CLASSES: Record<string, string> = {
  settled: 'text-green-600',
  submitted: 'text-blue-600',
  created: 'text-gray-600',
  failed: 'text-red-600',
};

export default function BatchMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { batches, stats, loading } = useBatches(autoRefresh);

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Batch Monitor</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh</span>
          </label>
        </div>

        <BatchStats stats={stats} />

        <div className="mt-8">
          <h3 className="mb-4 text-lg font-semibold">Recent Batches</h3>
          {loading ? (
            <Loading />
          ) : batches.length === 0 ? (
            <p className="text-sm text-gray-500">No batches yet</p>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => (
                <div key={batch.id} className="rounded border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{batch.id.slice(0, 8)}...</p>
                      <p className="text-sm text-gray-500">{batch.order_ids.length} orders</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${STATUS_TEXT_CLASSES[batch.status] ?? 'text-gray-600'}`}
                      >
                        {batch.status.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-500">{formatTimestamp(batch.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
