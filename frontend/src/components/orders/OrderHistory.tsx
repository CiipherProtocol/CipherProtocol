import { Order, OrderStatusValue } from '../../types/order';
import OrderItem from './OrderItem';
import OrderStatus from './OrderStatus';

interface Props {
  orders: Order[];
}

export default function OrderHistory({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        <p>No orders yet</p>
      </div>
    );
  }

  const groupedByStatus = orders.reduce<Record<string, Order[]>>((acc, order) => {
    if (!acc[order.status]) acc[order.status] = [];
    acc[order.status].push(order);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.entries(groupedByStatus).map(([status, statusOrders]) => (
        <div key={status}>
          <div className="mb-4 flex items-center gap-3">
            <OrderStatus status={status as OrderStatusValue} />
            <span className="text-sm text-gray-500">
              {statusOrders.length} order{statusOrders.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-3">
            {statusOrders.map((order) => (
              <OrderItem key={order.id} order={order} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
