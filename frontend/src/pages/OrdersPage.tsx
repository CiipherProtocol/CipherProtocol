import { useWallet } from '../hooks/useWallet';
import { useUserOrders } from '../hooks/useOrder';
import OrderHistory from '../components/orders/OrderHistory';
import Loading from '../components/common/Loading';
import Alert from '../components/common/Alert';

export default function OrdersPage() {
  const { address } = useWallet();
  const { orders, loading, error } = useUserOrders(address);

  if (!address) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        Please connect your wallet
      </div>
    );
  }

  return (
    <div className="py-8">
      <h1 className="mb-8 text-3xl font-bold">Your Orders</h1>
      {error && <Alert variant="error">{error}</Alert>}
      {loading ? <Loading /> : <OrderHistory orders={orders} />}
    </div>
  );
}
