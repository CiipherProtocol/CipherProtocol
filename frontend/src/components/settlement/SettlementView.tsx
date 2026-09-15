import { Settlement } from '../../types/settlement';
import { shortenAddress, formatTimestamp } from '../../utils/formatting';
import TransactionStatus from './TransactionStatus';

export default function SettlementView({ settlement }: { settlement: Settlement }) {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 p-6 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Batch {settlement.batch_id.slice(0, 8)}</h3>
        <TransactionStatus status={settlement.status} />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Settled {formatTimestamp(settlement.settled_at)}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">In</th>
              <th className="py-2 pr-4">Out</th>
              <th className="py-2">Fee</th>
            </tr>
          </thead>
          <tbody>
            {settlement.results.map((result, idx) => (
              <tr key={idx} className="border-b border-gray-200 last:border-0 dark:border-gray-800">
                <td className="py-2 pr-4 font-mono">{shortenAddress(result.user)}</td>
                <td className="py-2 pr-4">
                  {result.amount_in} {result.token_in}
                </td>
                <td className="py-2 pr-4">
                  {result.amount_out} {result.token_out}
                </td>
                <td className="py-2">{result.fee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
