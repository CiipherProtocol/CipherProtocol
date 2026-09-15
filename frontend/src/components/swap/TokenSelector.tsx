import { SUPPORTED_TOKENS } from '../../constants/tokens';

interface TokenSelectorProps {
  value: string;
  onChange: (symbol: string) => void;
  exclude?: string;
}

export default function TokenSelector({ value, onChange, exclude }: TokenSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 px-3 py-2 font-semibold dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
    >
      {SUPPORTED_TOKENS.filter((t) => t.symbol !== exclude).map((token) => (
        <option key={token.symbol} value={token.symbol}>
          {token.symbol}
        </option>
      ))}
    </select>
  );
}
