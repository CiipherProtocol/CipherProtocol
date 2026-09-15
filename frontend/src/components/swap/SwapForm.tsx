import React, { useState, useEffect } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { useSwap } from '../../hooks/useSwap';
import { useEncryption } from '../../hooks/useEncryption';
import { applySlippage } from '../../utils/numbers';
import { validateSwap } from '../../utils/validation';
import { getErrorMessage } from '../../utils/errors';
import { DEFAULT_SLIPPAGE_BPS } from '../../constants/config';
import TokenSelector from './TokenSelector';
import AmountInput from './AmountInput';
import PriceImpact from './PriceImpact';
import SubmitButton from './SubmitButton';
import Alert from '../common/Alert';

export default function SwapForm() {
  const { address, isConnected } = useWallet();
  const { submitOrder, loading: submitting } = useSwap();
  const { encryptOrder } = useEncryption();

  const [tokenIn, setTokenIn] = useState('USDC');
  const [tokenOut, setTokenOut] = useState('USDT');
  const [amountIn, setAmountIn] = useState('');
  const [minAmountOut, setMinAmountOut] = useState('');
  const [priceImpact, setPriceImpact] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (amountIn) {
      setMinAmountOut(applySlippage(amountIn, DEFAULT_SLIPPAGE_BPS));
      setPriceImpact(DEFAULT_SLIPPAGE_BPS / 100);
    } else {
      setMinAmountOut('');
      setPriceImpact(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountIn]);

  const flipTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);

    if (!isConnected || !address) {
      setError('Please connect your wallet');
      return;
    }

    const validationError = validateSwap({ tokenIn, tokenOut, amountIn, minAmountOut });
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);

      const order = {
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in: amountIn,
        min_amount_out: minAmountOut,
        nonce: Math.floor(Math.random() * 1_000_000),
      };

      const encrypted = await encryptOrder(order);

      await submitOrder({
        user: address,
        encrypted_data: encrypted.data,
        threshold_pubkey: encrypted.pubkey,
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in: amountIn,
        min_amount_out: minAmountOut,
        nonce: order.nonce,
      });

      setAmountIn('');
      setMinAmountOut('');
      setSuccess(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800"
    >
      <div>
        <label className="mb-2 block text-sm font-semibold">From</label>
        <div className="flex gap-2">
          <TokenSelector value={tokenIn} onChange={setTokenIn} exclude={tokenOut} />
          <AmountInput value={amountIn} onChange={setAmountIn} />
        </div>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={flipTokens}
          className="rounded-full bg-gray-100 p-2 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
          aria-label="Flip tokens"
        >
          ⇅
        </button>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold">To (minimum)</label>
        <div className="flex gap-2">
          <TokenSelector value={tokenOut} onChange={setTokenOut} exclude={tokenIn} />
          <AmountInput value={minAmountOut} disabled />
        </div>
      </div>

      <PriceImpact impact={priceImpact} />

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">Order submitted and encrypted.</Alert>}

      <SubmitButton
        loading={submitting}
        disabled={!isConnected || !amountIn}
        text={isConnected ? 'Submit Order' : 'Connect Wallet'}
      />

      <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
        <p className="mb-1 font-semibold">🔒 Your order is encrypted</p>
        <p>No validator or miner can see your swap details. Settlement happens atomically.</p>
      </div>
    </form>
  );
}
