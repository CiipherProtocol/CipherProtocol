import { Order } from '../../types/order';
import { formatTimestamp, shortenAddress } from '../../utils/formatting';
import OrderStatus from './OrderStatus';

export default function OrderDetails({ order }: { order: Order }) {
  return (
    <div className="space-y-3 rounded-lg border p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Order {order.id.slice(0, 8)}</h3>
        <OrderStatus status={order.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt className="text-gray-500">User</dt>
        <dd className="text-right font-mono">{shortenAddress(order.user_address)}</dd>
        <dt className="text-gray-500">From</dt>
        <dd className="text-right">
          {order.amount_in} {order.token_in}
        </dd>
        <dt className="text-gray-500">Minimum received</dt>
        <dd className="text-right">
          {order.min_amount_out} {order.token_out}
        </dd>
        {order.batch_id && (
          <>
            <dt className="text-gray-500">Batch</dt>
            <dd className="text-right font-mono">{order.batch_id.slice(0, 8)}</dd>
          </>
        )}
        <dt className="text-gray-500">Submitted</dt>
        <dd className="text-right">{formatTimestamp(order.created_at)}</dd>
      </dl>
    </div>
  );
}
