import { useWallet } from '../../hooks/useWallet';
import { shortenAddress } from '../../utils/formatting';
import Button from './Button';

export default function WalletConnect() {
  const { address, isConnected, connecting, kind, error, connect, disconnect } = useWallet();

  if (isConnected && address) {
    return (
      <button
        onClick={disconnect}
        className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 font-mono text-sm hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        title={kind === 'demo' ? 'Throwaway demo key for this tab. Click to discard it.' : 'Click to disconnect'}
      >
        {kind === 'demo' && (
          <span className="rounded bg-amber-200 px-1.5 py-0.5 font-sans text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
            DEMO
          </span>
        )}
        {shortenAddress(address)}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => connect('demo')}
          disabled={connecting}
          className="rounded-lg px-3 py-2 text-sm text-gray-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-gray-300"
          title="Generates a throwaway testnet key in this tab, so you can try the app without installing a wallet"
        >
          Try demo wallet
        </button>
        <Button onClick={() => connect('freighter')} disabled={connecting}>
          {connecting ? 'Connecting...' : 'Connect Freighter'}
        </Button>
      </div>
      {error && <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
