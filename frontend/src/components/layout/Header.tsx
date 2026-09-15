import { Link, useLocation } from 'react-router-dom';
import WalletConnect from '../common/WalletConnect';
import ThemeToggle from '../common/ThemeToggle';

const NAV_LINKS = [
  { to: '/swap', label: 'Swap' },
  { to: '/orders', label: 'Orders' },
  { to: '/docs', label: 'Docs' },
];

export default function Header() {
  const location = useLocation();

  return (
    <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold">
          <img src="/logo.svg" alt="" className="h-8 w-8 rounded-lg" />
          Cipher Protocol
        </Link>
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium ${
                location.pathname === link.to
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}
