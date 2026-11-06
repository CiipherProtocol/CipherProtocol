const SECTIONS = [
  {
    title: '1. Sign in with your wallet',
    body: 'Freighter signs a challenge transaction that can never be submitted on-chain. The server verifies the signature against your account before accepting any order from it.',
  },
  {
    title: '2. Submit an encrypted order',
    body: 'Your swap is encrypted in the browser to the validator set’s threshold public key (ElGamal on ristretto255 + AES-256-GCM) and bound to your address. The server only ever receives ciphertext.',
  },
  {
    title: '3. Batching',
    body: 'Pending orders are sealed into a batch in arrival order, and an attestation (order count + content hash) is recorded on-chain through the order-vault contract. Once a batch is sealed, its contents and order can’t change.',
  },
  {
    title: '4. Threshold decryption',
    body: 'The validators generated the encryption key together (distributed key generation), so no one ever held the whole key. Only after sealing does each validator compute a decryption share with a zero-knowledge proof that it’s correct. Any t of n valid shares decrypt the batch. Fewer reveal nothing, and invalid shares are detected and discarded.',
  },
  {
    title: '5. Atomic settlement',
    body: 'Decrypted orders are executed together by the settlement-engine contract against its AMM liquidity pool. All orders in a batch settle together or not at all. Live on Stellar testnet with real token transfers.',
  },
];

export default function DocsPage() {
  return (
    <div className="py-8">
      <h1 className="mb-8 text-3xl font-bold">How it works</h1>
      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mb-2 text-xl font-semibold">{section.title}</h2>
            <p className="text-gray-600 dark:text-gray-400">{section.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <p className="mb-1 font-semibold">Not fully decentralized yet</p>
        <p>
          The encryption, share verification, distributed key generation, and separate validator processes are
          real. But validators are still run by one party and still trust the backend about when a batch is sealed.
          Next, validators will verify an on-chain commitment before decrypting. See the{' '}
          <a
            href="https://github.com/CiipherProtocol/CipherProtocol/blob/main/docs/THRESHOLD_ENCRYPTION.md"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            threshold encryption design
          </a>{' '}
          for what&apos;s real versus in progress.
        </p>
      </div>
    </div>
  );
}
