import SwapForm from '../components/swap/SwapForm';
import BatchMonitor from '../components/batches/BatchMonitor';

export default function SwapPage() {
  return (
    <div className="grid gap-8 py-8 md:grid-cols-3">
      <div className="md:col-span-1">
        <h1 className="mb-4 text-3xl font-bold">MEV-Resistant Swap</h1>
        <p className="mb-8 text-gray-600 dark:text-gray-400">
          Your order is encrypted and cannot be front-run
        </p>
        <SwapForm />
      </div>

      <div className="md:col-span-2">
        <BatchMonitor />
      </div>
    </div>
  );
}
