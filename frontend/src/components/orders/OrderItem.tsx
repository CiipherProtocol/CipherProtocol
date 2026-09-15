import { Order } from '../../types/order';
import { formatTimestamp } from '../../utils/formatting';
import OrderStatus from './OrderStatus';

export default function OrderItem({ order }: { order: Order }) {
  return (
    <div className="rounded border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {order.token_in} → {order.token_out}
          </p>
          <p className="text-sm text-gray-500">
            {order.amount_in} {order.token_in} · min {order.min_amount_out} {order.token_out}
          </p>
        </div>
        <div className="text-right">
          <OrderStatus status={order.status} />
          <p className="mt-1 text-sm text-gray-500">{formatTimestamp(order.created_at)}</p>
        </div>
      </div>
    </div>
  );
}
