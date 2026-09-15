interface TransactionStatusProps {
  status: 'settled' | 'failed';
}

export default function TransactionStatus({ status }: TransactionStatusProps) {
  const isSettled = status === 'settled';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
        isSettled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {isSettled ? '✓ Settled' : '✕ Failed'}
    </span>
  );
}
