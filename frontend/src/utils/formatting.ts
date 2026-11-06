import { fromBaseUnits } from './numbers';

export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatTimestamp(value: string | number): string {
  const date = new Date(value);
  return date.toLocaleString();
}

export function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Display string for a base-unit amount, or a sealed marker while the order is still encrypted. */
export function formatOrderAmount(units: string | null, symbol: string | null, decimals = 7): string {
  if (units === null || symbol === null) return '🔒 sealed';
  return `${fromBaseUnits(units, decimals)} ${symbol}`;
}
