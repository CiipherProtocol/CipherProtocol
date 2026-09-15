export function toDisplayAmount(raw: string | number, decimals: number): string {
  const value = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (Number.isNaN(value)) return '0';
  return value.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, '') || '0';
}

export function applySlippage(amount: string, slippageBps: number): string {
  const value = parseFloat(amount);
  if (Number.isNaN(value)) return '0';
  const minOut = value * (1 - slippageBps / 10000);
  return minOut.toFixed(7);
}

export function isPositiveNumeric(value: string): boolean {
  if (value.trim() === '') return false;
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}
