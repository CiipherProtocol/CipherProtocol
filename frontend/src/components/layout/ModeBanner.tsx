import { useNetworkConfig } from '../../hooks/useNetworkConfig';

const CONTRACT_URL = 'https://stellar.expert/explorer/testnet/contract/';

/**
 * States plainly which parts of this deployment are real and which are
 * simulated, using what the backend reports about itself. Hidden only
 * when everything runs on-chain.
 */
export default function ModeBanner() {
  const { config, unreachable } = useNetworkConfig();

  if (unreachable) {
    return (
      <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
        Backend unreachable. If this is the hosted demo, it may be waking up, so retry in about 30 seconds.
      </div>
    );
  }
  if (!config || (config.sealing === 'onchain' && config.settlement === 'onchain')) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-semibold">Testnet demo.</span> Orders are really threshold-encrypted and decrypted by{' '}
      {config.threshold}-of-{config.validator_count} validators.{' '}
      {config.sealing === 'onchain' && config.order_vault_contract ? (
        <>
          Batches are sealed on-chain in{' '}
          <a
            className="underline"
            href={`${CONTRACT_URL}${config.order_vault_contract}`}
            target="_blank"
            rel="noreferrer"
          >
            order-vault
          </a>
          .{' '}
        </>
      ) : (
        <>Batches are sealed in a local dev ledger. </>
      )}
      {config.settlement === 'simulated' && <>Settlement is simulated, so no tokens move.</>}
    </div>
  );
}
