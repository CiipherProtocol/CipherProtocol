interface AmountInputProps {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function AmountInput({
  value,
  onChange,
  disabled = false,
  placeholder = '0.0',
}: AmountInputProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        if (/^\d*\.?\d*$/.test(next)) onChange?.(next);
      }}
      className="w-full flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-right disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-900 dark:disabled:text-gray-500"
    />
  );
}
