import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { generateIdentity, signPayload } from '../src/crypto/signing';
import { LocalValidator } from '../src/validator/localValidator';
import { DOMAIN, SignedComplaint, SignedTransportKey } from '../src/validator/protocol';
import { runDkg } from '../src/services/validatorNetwork';

/**
 * The DKG coordinator only routes messages and must be treated as hostile.
 * These tests play a malicious coordinator against honest validators.
 */
function cluster(n = 3) {
  const ids = Array.from({ length: n }, () => generateIdentity());
  const peers = Object.fromEntries(ids.map((id, k) => [k + 1, id.publicKey]));
  const validators = ids.map((identity, k) => new LocalValidator(k + 1, { identity, peers }));
  return { validators, peers, participants: validators.map((v) => v.index) };
}

const attacker = generateIdentity();

describe('DKG against a malicious coordinator', () => {
  it('validators refuse to deal if a transport key is swapped for the coordinator’s own', async () => {
    const { validators, participants } = cluster();
    const session = crypto.randomUUID();
    const keys = await Promise.all(validators.map((v) => v.dkgBegin(session, 2, participants)));
    // Replace validator 3's transport key with one the attacker controls, re-signed by the attacker.
    const swapped: SignedTransportKey = signPayload(
      DOMAIN.transportKey,
      { session, index: 3, transportKey: keys[0].payload.transportKey },
      3,
      attacker.secretKey
    );
    const tampered = [keys[0], keys[1], swapped];
    for (const v of validators) {
      await expect(v.dkgDeal(tampered)).rejects.toThrow(/no valid transport key for validator 3/);
    }
  });

  it('forged complaints are ignored, so no share is revealed', async () => {
    const { validators, participants } = cluster();
    const session = crypto.randomUUID();
    const keys = await Promise.all(validators.map((v) => v.dkgBegin(session, 2, participants)));
    const dealt = await Promise.all(validators.map((v) => v.dkgDeal(keys)));
    const broadcasts = dealt.map((d) => d.broadcast);
    const shares = dealt.flatMap((d) => d.shares);
    for (const v of validators) {
      expect(await v.dkgReceive(broadcasts, shares.filter((s) => s.payload.recipient === v.index))).toEqual([]);
    }
    // The coordinator fabricates "validator 3 complains about dealer 1", signed with its own key.
    const forged: SignedComplaint = signPayload(DOMAIN.complaint, { session, complainer: 3, dealer: 1 }, 3, attacker.secretKey);
    expect(await validators[0].dkgRespond([forged])).toEqual([]);
  });

  it('withholding a share stalls the DKG rather than leaking it', async () => {
    const { validators, participants } = cluster();
    const session = crypto.randomUUID();
    const keys = await Promise.all(validators.map((v) => v.dkgBegin(session, 2, participants)));
    const dealt = await Promise.all(validators.map((v) => v.dkgDeal(keys)));
    const toThree = dealt.flatMap((d) => d.shares).filter((s) => s.payload.recipient === 3 && s.payload.dealer !== 1);
    await expect(validators[2].dkgReceive(dealt.map((d) => d.broadcast), toThree)).rejects.toThrow(/aborting DKG/);
  });

  it('a broadcast altered in transit is dropped consistently by every validator', async () => {
    const { validators, participants } = cluster(4);
    const session = crypto.randomUUID();
    const keys = await Promise.all(validators.map((v) => v.dkgBegin(session, 2, participants)));
    const dealt = await Promise.all(validators.map((v) => v.dkgDeal(keys)));
    const broadcasts = dealt.map((d) => d.broadcast);
    const altered = { ...broadcasts[3], payload: { ...broadcasts[3].payload, commitments: [...broadcasts[0].payload.commitments] } };
    const transcript = { broadcasts: [broadcasts[0], broadcasts[1], broadcasts[2], altered], complaints: [], reveals: [] };
    for (const v of validators) expect(v.verifyTranscript(transcript).broadcasts.map((b) => b.dealer)).toEqual([1, 2, 3]);
  });

  it('signed messages from an earlier session are rejected', async () => {
    const { validators, participants } = cluster();
    const old = await Promise.all(validators.map((v) => v.dkgBegin('old-session', 2, participants)));
    for (const v of validators) {
      await v.dkgBegin('new-session', 2, participants); // session restarted (e.g. after an abort)
      await expect(v.dkgDeal(old)).rejects.toThrow(/no valid transport key/);
    }
  });

  it('a validator that already holds a key refuses to re-key', async () => {
    const { validators, peers } = cluster();
    await runDkg(validators, 2, peers);
    await expect(validators[0].dkgBegin('again', 2, [1, 2, 3])).rejects.toThrow(/refusing to re-key/);
  });

  it('the coordinator rejects a result statement not signed by the validator', async () => {
    const { validators } = cluster();
    const wrongKeys = Object.fromEntries(validators.map((v) => [v.index, attacker.publicKey]));
    await expect(runDkg(validators, 2, wrongKeys)).rejects.toThrow(/bad result signature/);
  });
});
