import { BatchStatsSummary } from '../../types/batch';

export default function BatchStats({ stats }: { stats: BatchStatsSummary }) {
  const items: { label: string; value: number }[] = [
    { label: 'Total batches', value: stats.total },
    { label: 'Pending', value: stats.pending },
    { label: 'Settled', value: stats.settled },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-800">
          <p className="text-2xl font-bold">{item.value}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
