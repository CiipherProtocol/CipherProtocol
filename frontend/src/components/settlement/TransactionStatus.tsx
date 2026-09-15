interface TransactionStatusProps {
  status: 'settled' | 'failed';
}

export default function TransactionStatus({ status }: TransactionStatusProps) {
  const isSettled = status === 'settled';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
        isSettled
          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
      }`}
    >
      {isSettled ? '✓ Settled' : '✕ Failed'}
    </span>
  );
}
