const SECTIONS = [
  {
    title: '1. Submit an encrypted order',
    body: 'You enter swap details in the browser. The order is encrypted client-side with the threshold public key before it ever reaches the backend — the backend and any single validator can only see ciphertext.',
  },
  {
    title: '2. Batching',
    body: 'The backend accumulates encrypted orders and, once a batch size or timeout is reached, submits the batch to the order-vault contract.',
  },
  {
    title: '3. Threshold decryption',
    body: 'A quorum of validators cooperatively decrypts the batch. No single validator holds enough key material to decrypt alone.',
  },
  {
    title: '4. Atomic settlement',
    body: 'Decrypted orders are matched and executed together by the settlement-engine contract against the AMM liquidity pools — all orders in a batch settle together or not at all.',
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
            <p className="text-gray-600">{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
