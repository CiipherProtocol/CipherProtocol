import { Link } from 'react-router-dom';
import Button from '../components/common/Button';

export default function HomePage() {
  return (
    <div className="py-20 text-center">
      <img src="/logo.svg" alt="Cipher Protocol" className="mx-auto mb-6 h-20 w-20 rounded-2xl" />
      <h1 className="mb-4 text-4xl font-bold">MEV-Resistant Swaps</h1>
      <p className="mx-auto mb-8 max-w-xl text-gray-600 dark:text-gray-400">
        Orders are encrypted before they leave your browser, batched, and settled atomically —
        no validator or miner can front-run your trade.
      </p>
      <Link to="/swap">
        <Button>Launch App</Button>
      </Link>
    </div>
  );
}
