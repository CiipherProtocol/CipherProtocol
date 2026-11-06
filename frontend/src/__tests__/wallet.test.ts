import { describe, it, expect } from 'vitest';
import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { walletService } from '../services/wallet';

function challengeFor(address: string) {
  return new TransactionBuilder(new Account(address, '-1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.manageData({ name: 'cipher-protocol auth', value: 'x'.repeat(64) }))
    .setTimeout(300)
    .build()
    .toXDR();
}

describe('demo wallet', () => {
  it('creates a throwaway key and signs challenges the backend can verify', async () => {
    const address = await walletService.connect('demo');
    expect(walletService.kind()).toBe('demo');
    expect(address).toMatch(/^G[A-Z2-7]{55}$/);

    const signed = TransactionBuilder.fromXDR(
      await walletService.signTransaction(challengeFor(address), Networks.TESTNET),
      Networks.TESTNET
    );
    const kp = Keypair.fromPublicKey(address);
    expect(signed.signatures).toHaveLength(1);
    expect(kp.verify(signed.hash(), signed.signatures[0].signature())).toBe(true);
  });

  it('a new demo session gets a new key, and disconnect discards it', async () => {
    const a = await walletService.connect('demo');
    const b = await walletService.connect('demo');
    expect(a).not.toBe(b);
    walletService.disconnect();
    expect(walletService.kind()).toBeNull();
    expect(await walletService.getAddress()).toBeNull();
  });

  it('points users to the demo wallet when Freighter is missing', async () => {
    await expect(walletService.connect('freighter')).rejects.toThrow(/demo wallet/);
  });
});
