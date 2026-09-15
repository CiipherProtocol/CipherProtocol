const SECTIONS = [
  {
    title: '1. Submit an encrypted order',
    body: 'You enter swap details in the browser and they’re encrypted before submission. Today that encryption is a placeholder (not real threshold crypto) — see the "not built yet" note below.',
  },
  {
    title: '2. Batching',
    body: 'The backend accumulates orders and, once a batch size or timeout is reached, records an on-chain attestation (order count + content hash) via the order-vault contract. This part is live on Stellar testnet.',
  },
  {
    title: '3. Threshold decryption',
    body: 'The design calls for a quorum of validators to cooperatively decrypt each batch, so no single validator ever holds enough key material to decrypt alone. Not built yet — there is no validator set running.',
  },
  {
    title: '4. Atomic settlement',
    body: 'Decrypted orders are matched and executed together by the settlement-engine contract against its AMM liquidity pool — all orders in a batch settle together or not at all. This part is live and verified on Stellar testnet, including real token transfers.',
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
        <p className="mb-1 font-semibold">Not built yet</p>
        <p>
          Real threshold encryption and validator coordination don&apos;t exist yet —
          steps 1 and 3 above describe the design, not current behavior. See the{' '}
          <a
            href="https://github.com/CiipherProtocol/CipherProtocol#status"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            project README
          </a>{' '}
          for the full list of what&apos;s real versus in progress.
        </p>
      </div>
    </div>
  );
}
