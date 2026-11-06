// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import { ristretto255 } from '@noble/curves/ed25519';
import { decryptWithSharedPoint, parseCiphertext, randomScalar } from '../crypto/orderCipher';

const USER = 'GAUSERADDRESS';
const y = randomScalar();
const groupKey = ristretto255.Point.BASE.multiply(y).toHex();

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../services/api', () => ({ api: { post, get }, default: { post, get } }));
vi.mock('../services/auth', () => ({
  authService: { authHeaders: vi.fn(async () => ({ Authorization: 'Bearer test' })) },
}));
vi.mock('../hooks/useWallet', () => ({ useWallet: () => ({ address: USER, isConnected: true }) }));

import SwapForm from '../components/swap/SwapForm';

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: { order: { id: 'o1' } } });
  get.mockReset().mockResolvedValue({ data: { threshold_pubkey: groupKey, threshold: 3, validator_count: 5 } });
});

describe('SwapForm', () => {
  it('sends only ciphertext, which decrypts to the exact order in base units', async () => {
    const { container } = render(<SwapForm />);
    const input = container.querySelector('input:not([disabled])') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1.5' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body, opts] = post.mock.calls[0];
    expect(url).toBe('/orders');
    expect(Object.keys(body).sort()).toEqual(['encrypted_data', 'nonce', 'threshold_pubkey']);
    expect(JSON.stringify(body)).not.toMatch(/USDC|15000000/);
    expect(opts.headers.Authorization).toBe('Bearer test');

    // Holder of the (normally threshold-shared) secret can open it.
    const K = ristretto255.Point.fromBytes(parseCiphertext(body.encrypted_data).R).multiply(y).toBytes();
    const order = JSON.parse(await decryptWithSharedPoint(body.encrypted_data, K, USER));
    expect(order).toMatchObject({
      user: USER,
      token_in: 'USDC',
      token_out: 'USDT',
      amount_in: '15000000',
      min_amount_out: '14850000',
      nonce: body.nonce,
    });
    expect(await screen.findByText(/3-of-5 validators/)).toBeTruthy();
  });

  it('refuses amounts with more precision than the token supports', async () => {
    const { container } = render(<SwapForm />);
    const input = container.querySelector('input:not([disabled])') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1.000000001' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText(/decimal places/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});
