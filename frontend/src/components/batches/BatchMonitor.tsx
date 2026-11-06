import { useState } from 'react';
import { useBatches } from '../../hooks/useBatches';
import { formatTimestamp } from '../../utils/formatting';
import Loading from '../common/Loading';
import BatchStats from './BatchStats';
import { Batch } from '../../types/batch';
import { STELLAR_EXPLORER_TX_URL } from '../../constants/config';

const STATUS_TEXT_CLASSES: Record<string, string> = {
  settled: 'text-green-600 dark:text-green-400',
  submitted: 'text-blue-600 dark:text-blue-400',
  created: 'text-gray-600 dark:text-gray-400',
  failed: 'text-red-600 dark:text-red-400',
};

/** Shows the on-chain commitment that sealed this batch before any validator would decrypt it. */
function BatchSeal({ batch }: { batch: Batch }) {
  if (!batch.content_hash) return null;
  const short = `${batch.content_hash.slice(0, 10)}…`;
  return (
    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" title={batch.content_hash}>
      🔏 Sealed:{' '}
      {batch.commitment_tx ? (
        <a
          href={`${STELLAR_EXPLORER_TX_URL}${batch.commitment_tx}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono underline"
        >
          {short}
        </a>
      ) : (
        <span className="font-mono">{short} (local dev ledger)</span>
      )}
    </p>
  );
}

export default function BatchMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { batches, stats, loading } = useBatches(autoRefresh);

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
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
            <p className="text-sm text-gray-500 dark:text-gray-400">No batches yet</p>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => (
                <div key={batch.id} className="rounded border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{batch.id.slice(0, 8)}...</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{batch.order_ids.length} orders</p>
                      <BatchSeal batch={batch} />
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${STATUS_TEXT_CLASSES[batch.status] ?? 'text-gray-600 dark:text-gray-400'}`}
                      >
                        {batch.status.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{formatTimestamp(batch.created_at)}</p>
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
