import { OrderStatusValue } from '../../types/order';
import { formatStatus } from '../../utils/formatting';

const STATUS_CLASSES: Record<OrderStatusValue, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  batched: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  settled: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export default function OrderStatus({ status }: { status: OrderStatusValue }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}>
      {formatStatus(status)}
    </span>
  );
}
