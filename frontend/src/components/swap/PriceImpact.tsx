interface PriceImpactProps {
  impact: number;
}

export default function PriceImpact({ impact }: PriceImpactProps) {
  const color =
    impact >= 3
      ? 'text-red-600 dark:text-red-400'
      : impact >= 1
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-gray-500 dark:text-gray-400';

  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500 dark:text-gray-400">Price impact</span>
      <span className={color}>{impact.toFixed(2)}%</span>
    </div>
  );
}
