import { describe, it, expect } from 'vitest';
import { applySlippage, fromBaseUnits, isPositiveNumeric, toBaseUnits } from '../utils/numbers';
import { validateSwap } from '../utils/validation';
import { formatOrderAmount } from '../utils/formatting';

describe('base-unit conversion', () => {
  it('converts decimal strings exactly, without float rounding', () => {
    expect(toBaseUnits('1', 7)).toBe('10000000');
    expect(toBaseUnits('1.5', 7)).toBe('15000000');
    expect(toBaseUnits('0.0000001', 7)).toBe('1');
    expect(toBaseUnits('0.1', 7)).toBe('1000000'); // 0.1 is inexact as a float
    expect(toBaseUnits('123456789012.1234567', 7)).toBe('1234567890121234567');
  });

  it('rejects precision beyond the token and non-numeric input', () => {
    expect(() => toBaseUnits('1.00000001', 7)).toThrow(/7 decimal/);
    expect(() => toBaseUnits('1e5', 7)).toThrow();
    expect(() => toBaseUnits('-1', 7)).toThrow();
  });

  it('round-trips through fromBaseUnits', () => {
    for (const v of ['1', '1.5', '0.0000001', '42.42']) {
      expect(fromBaseUnits(toBaseUnits(v, 7), 7)).toBe(v);
    }
  });

  it('applies slippage', () => {
    expect(applySlippage('100', 100)).toBe('99.0000000');
  });
});

describe('swap validation', () => {
  it('requires distinct tokens and positive amounts', () => {
    expect(validateSwap({ tokenIn: 'USDC', tokenOut: 'USDC', amountIn: '1', minAmountOut: '1' })).toMatch(/different/);
    expect(validateSwap({ tokenIn: 'USDC', tokenOut: 'XLM', amountIn: '0', minAmountOut: '1' })).toMatch(/amount/);
    expect(validateSwap({ tokenIn: 'USDC', tokenOut: 'XLM', amountIn: '2', minAmountOut: '1' })).toBeNull();
    expect(isPositiveNumeric('  ')).toBe(false);
  });
});

describe('order display', () => {
  it('shows sealed orders as sealed and revealed amounts in token units', () => {
    expect(formatOrderAmount(null, null)).toMatch(/sealed/);
    expect(formatOrderAmount('15000000', 'USDC')).toBe('1.5 USDC');
  });
});
