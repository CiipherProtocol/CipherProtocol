import { Link, useLocation } from 'react-router-dom';
import WalletConnect from '../common/WalletConnect';

const NAV_LINKS = [
  { to: '/swap', label: 'Swap' },
  { to: '/orders', label: 'Orders' },
  { to: '/docs', label: 'Docs' },
];

export default function Header() {
  const location = useLocation();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="text-xl font-bold">
          Cipher Protocol
        </Link>
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium ${
                location.pathname === link.to
                  ? 'text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <WalletConnect />
      </div>
    </header>
  );
}
