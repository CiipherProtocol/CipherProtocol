import { useWallet } from '../../hooks/useWallet';
import { shortenAddress } from '../../utils/formatting';
import Button from './Button';

export default function WalletConnect() {
  const { address, isConnected, connecting, connect, disconnect } = useWallet();

  if (isConnected && address) {
    return (
      <button
        onClick={disconnect}
        className="rounded-lg bg-gray-100 px-4 py-2 font-mono text-sm hover:bg-gray-200"
        title="Click to disconnect"
      >
        {shortenAddress(address)}
      </button>
    );
  }

  return (
    <Button onClick={connect} disabled={connecting}>
      {connecting ? 'Connecting...' : 'Connect Wallet'}
    </Button>
  );
}
