import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { decryptWithSharedPoint, encryptOrder, parseCiphertext } from '../src/crypto/orderCipher';
import { Point, combineShares, lagrangeAtZero, mod, partialDecrypt, KeyShare } from '../src/crypto/threshold';
import { DkgParticipant, computePublicResult } from '../src/crypto/dkg';
import { createLocalNetwork, runDkg } from '../src/services/validatorNetwork';
import { LocalValidator } from '../src/validator/localValidator';
import { generateIdentity } from '../src/crypto/signing';

const USER = 'GTESTUSER';

/** TEST-ONLY peek: reconstruct y from t shares to check it matches Y. No production code can do this. */
function reconstructSecret(shares: KeyShare[]): bigint {
  const idx = shares.map((s) => s.index);
  return shares.reduce((acc, s) => mod(acc + BigInt('0x' + s.secret) * lagrangeAtZero(s.index, idx)), 0n);
}

function sharesOf(validators: LocalValidator[]): KeyShare[] {
  // Reach into the simulated validators — only possible because they're in-process.
  return validators.map((v) => (v as unknown as { keyShare: KeyShare }).keyShare);
}

async function roundTrip(groupKey: string, shares: KeyShare[], subset: number[]) {
  const ct = await encryptOrder('{"order":1}', groupKey, USER);
  const R = parseCiphertext(ct).R;
  const ds = subset.map((i) => partialDecrypt(shares[i - 1], R));
  return decryptWithSharedPoint(ct, combineShares(ds, 3), USER);
}

describe('distributed key generation', () => {
  it('produces a consistent t-of-n key that any t validators can use', async () => {
    const net = await createLocalNetwork({ count: 5, threshold: 3 });
    const shares = sharesOf(net.validators as LocalValidator[]);

    expect(net.dkg.qualified).toEqual([1, 2, 3, 4, 5]);
    for (const s of shares) {
      expect(Point.BASE.multiply(BigInt('0x' + s.secret)).toHex()).toBe(net.dkg.verificationKeys[s.index]);
    }
    // Every t-subset interpolates to the same secret, matching the public group key.
    for (const subset of [[0, 1, 2], [2, 3, 4], [0, 2, 4]]) {
      const y = reconstructSecret(subset.map((i) => shares[i]));
      expect(Point.BASE.multiply(y).toHex()).toBe(net.groupPublicKey);
    }
    expect(await roundTrip(net.groupPublicKey, shares, [1, 4, 5])).toBe('{"order":1}');
  });

  it('two runs produce independent keys', async () => {
    const a = await createLocalNetwork({ count: 3, threshold: 2 });
    const b = await createLocalNetwork({ count: 3, threshold: 2 });
    expect(a.groupPublicKey).not.toBe(b.groupPublicKey);
  });

  it('the coordinator never sees a secret share: the transcript holds only ciphertext and commitments', async () => {
    const ids = Array.from({ length: 5 }, () => generateIdentity());
    const peers = Object.fromEntries(ids.map((id, k) => [k + 1, id.publicKey]));
    const validators = ids.map((identity, k) => new LocalValidator(k + 1, { identity, peers }));
    const routed: string[] = [];
    // Wrap deal() to capture exactly what passes through the coordinator.
    for (const v of validators) {
      const deal = v.dkgDeal.bind(v);
      v.dkgDeal = async (keys) => {
        const out = await deal(keys);
        routed.push(JSON.stringify(out));
        return out;
      };
    }
    const { transcript } = await runDkg(validators, 3, peers);
    const seen = routed.join('') + JSON.stringify(transcript);
    for (const s of sharesOf(validators)) expect(seen).not.toContain(s.secret);
    expect(transcript.complaints).toEqual([]);
    expect(transcript.reveals).toEqual([]);
  });

  it('a dealer that sends a bad share but answers the complaint honestly stays qualified', async () => {
    const net = await createLocalNetwork({ count: 5, threshold: 3, dkgFaults: { 2: { corruptSharesTo: [4] } } });
    expect(net.dkg.qualified).toEqual([1, 2, 3, 4, 5]);
    const shares = sharesOf(net.validators as LocalValidator[]);
    expect(await roundTrip(net.groupPublicKey, shares, [2, 3, 4])).toBe('{"order":1}');
  });

  it('a dealer that lies when accused is disqualified, and the rest still produce a working key', async () => {
    const net = await createLocalNetwork({
      count: 5,
      threshold: 3,
      dkgFaults: { 3: { corruptSharesTo: [1, 5], lieOnReveal: true } },
    });
    expect(net.dkg.qualified).toEqual([1, 2, 4, 5]);
    const shares = sharesOf(net.validators as LocalValidator[]);
    // The disqualified dealer is still a share-holder (QUAL is about dealing).
    expect(await roundTrip(net.groupPublicKey, shares, [3, 4, 5])).toBe('{"order":1}');
  });

  it('aborts when too many dealers are disqualified', async () => {
    const liar = { corruptSharesTo: [1], lieOnReveal: true };
    await expect(
      createLocalNetwork({ count: 5, threshold: 3, dkgFaults: { 2: liar, 3: liar, 4: liar } })
    ).rejects.toThrow(/only 2 qualified dealers, need at least 3/);
  });

  it('a share delivered to the wrong recipient fails to decrypt and draws a complaint', async () => {
    const ps = [1, 2, 3].map((i) => new DkgParticipant(i, 2, [1, 2, 3], 'session-x'));
    const keys = Object.fromEntries(ps.map((p) => [p.index, p.transportPublicKey]));
    const dealt = await Promise.all(ps.map((p) => p.deal(keys)));
    const broadcasts = dealt.map((d) => d.broadcast);
    const shares = dealt.flatMap((d) => d.shares);
    // Dealer 1's share for validator 2, relabelled and routed to validator 3.
    const misrouted = shares.map((s) =>
      s.dealer === 1 && s.recipient === 3 ? { ...shares.find((x) => x.dealer === 1 && x.recipient === 2)!, recipient: 3 } : s
    );
    expect(await ps[2].receive(broadcasts, misrouted.filter((s) => s.recipient === 3))).toEqual([
      { complainer: 3, dealer: 1 },
    ]);
  });

  it('a missing share aborts instead of drawing a complaint (no reveal for a router to harvest)', async () => {
    const ps = [1, 2, 3].map((i) => new DkgParticipant(i, 2, [1, 2, 3], 'session-m'));
    const keys = Object.fromEntries(ps.map((p) => [p.index, p.transportPublicKey]));
    const dealt = await Promise.all(ps.map((p) => p.deal(keys)));
    const withheld = dealt.flatMap((d) => d.shares).filter((s) => s.recipient === 3 && s.dealer !== 2);
    await expect(ps[2].receive(dealt.map((d) => d.broadcast), withheld)).rejects.toThrow(/no share received from dealer 2/);
  });

  it('a share replayed from another DKG session is rejected', async () => {
    const mk = (session: string) => [1, 2].map((i) => new DkgParticipant(i, 2, [1, 2], session));
    const [a, b] = [mk('s1'), mk('s2')];
    // Same recipient transport key in both sessions to isolate session binding.
    const keysA = Object.fromEntries(a.map((p) => [p.index, p.transportPublicKey]));
    const dealtA = await Promise.all(a.map((p) => p.deal(keysA)));
    const dealtB = await Promise.all(b.map((p) => p.deal(keysA)));
    const replayed = dealtB.flatMap((d) => d.shares).filter((s) => s.recipient === 1);
    const complaints = await a[0].receive(dealtA.map((d) => d.broadcast), replayed);
    expect(complaints.map((c) => c.dealer).sort()).toEqual([1, 2]);
  });

  it('malformed or equivocating commitments disqualify a dealer without a complaint round', () => {
    const G = Point.BASE.toHex();
    const good = (dealer: number) => ({ dealer, commitments: [G, G] });
    const base = { complaints: [], reveals: [] };
    expect(
      computePublicResult({ ...base, broadcasts: [good(1), good(2), { dealer: 3, commitments: [G] }] }, [1, 2, 3], 2)
        .qualified
    ).toEqual([1, 2]);
    expect(
      computePublicResult({ ...base, broadcasts: [good(1), good(2), good(3), good(3)] }, [1, 2, 3], 2).qualified
    ).toEqual([1, 2]);
  });

  it('persists one key file per validator, each holding only its own share', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cipher-dkg-'));
    try {
      const net = await createLocalNetwork({ count: 3, threshold: 2, keyDir: dir });
      const shares = sharesOf(net.validators as LocalValidator[]);
      for (const s of shares) {
        const file = fs.readFileSync(path.join(dir, `validator-${s.index}.json`), 'utf8');
        expect(JSON.parse(file).secret).toBe(s.secret);
        for (const other of shares) if (other.index !== s.index) expect(file).not.toContain(other.secret);
        expect(fs.statSync(path.join(dir, `validator-${s.index}.json`)).mode & 0o077).toBe(0);
      }
      const transcript = fs.readFileSync(path.join(dir, 'dkg-transcript.json'), 'utf8');
      for (const s of shares) expect(transcript).not.toContain(s.secret);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
