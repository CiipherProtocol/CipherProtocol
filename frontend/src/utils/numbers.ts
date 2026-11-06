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

/**
 * Exact decimal-string → integer base-unit conversion (no float rounding).
 * "1.5" with 7 decimals → "15000000". Throws on input with more fractional
 * digits than the token supports rather than silently truncating.
 */
export function toBaseUnits(amount: string, decimals: number): string {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`invalid amount "${amount}"`);
  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) throw new Error(`at most ${decimals} decimal places allowed`);
  const units = (whole + frac.padEnd(decimals, '0')).replace(/^0+(?=\d)/, '');
  return units;
}

export function fromBaseUnits(units: string, decimals: number): string {
  if (!/^\d+$/.test(units)) return units;
  const padded = units.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}
