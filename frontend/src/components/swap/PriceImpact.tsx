interface PriceImpactProps {
  impact: number;
}

export default function PriceImpact({ impact }: PriceImpactProps) {
  const color = impact >= 3 ? 'text-red-600' : impact >= 1 ? 'text-yellow-600' : 'text-gray-500';

  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">Price impact</span>
      <span className={color}>{impact.toFixed(2)}%</span>
    </div>
  );
}
