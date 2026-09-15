import { isPositiveNumeric } from './numbers';

export interface SwapValidationInput {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
}

export function validateSwap({
  tokenIn,
  tokenOut,
  amountIn,
  minAmountOut,
}: SwapValidationInput): string | null {
  if (tokenIn === tokenOut) return 'Select two different tokens';
  if (!isPositiveNumeric(amountIn)) return 'Enter a valid amount';
  if (!isPositiveNumeric(minAmountOut)) return 'Enter a valid minimum output';
  return null;
}
