import { Order } from '../../types/order';
import { formatOrderAmount, formatTimestamp } from '../../utils/formatting';
import OrderStatus from './OrderStatus';

export default function OrderItem({ order }: { order: Order }) {
  return (
    <div className="rounded border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {order.token_in && order.token_out ? `${order.token_in} → ${order.token_out}` : 'Encrypted order'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {order.token_in
              ? `${formatOrderAmount(order.amount_in, order.token_in)} · min ${formatOrderAmount(order.min_amount_out, order.token_out)}`
              : 'Details are revealed only after the batch is sealed and threshold-decrypted'}
          </p>
          {order.failure_reason && (
            <p className="text-sm text-red-600 dark:text-red-400">Rejected: {order.failure_reason}</p>
          )}
        </div>
        <div className="text-right">
          <OrderStatus status={order.status} />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {formatTimestamp(order.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
