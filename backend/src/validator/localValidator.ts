import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseCiphertext } from '../crypto/orderCipher';
import { DecryptionShare, KeyShare, Point, partialDecrypt } from '../crypto/threshold';
import { DkgFaults, DkgParticipant, DkgTranscript } from '../crypto/dkg';
import { Identity, Signed, canonicalJson, signPayload, verifySigned } from '../crypto/signing';
import {
  DOMAIN,
  DkgResultStatement,
  SignedBroadcast,
  SignedComplaint,
  SignedReveal,
  SignedShare,
  SignedTranscript,
  SignedTransportKey,
  ValidatorInfo,
  ValidatorNode,
} from './protocol';

export interface PersistedValidatorKey {
  index: number;
  threshold: number;
  participants: number[];
  groupPublicKey: string;
  verificationKeys: Record<number, string>;
  secret: string;
}

export interface LocalValidatorOptions {
  identity: Identity;
  /** Identity public keys of every validator (including this one), by index. */
  peers: Record<number, string>;
  /** Return invalid decryption shares (DLEQ verification must reject them). */
  byzantine?: boolean;
  dkgFaults?: DkgFaults;
  /** Persist this validator's own share here after DKG ('' = memory only). */
  keyFile?: string;
}

/**
 * One validator: one secret key share, one identity key, nothing else.
 * Runs either inside the backend (dev/tests) or as its own process behind
 * validator/server.ts — the code is the same; only the transport differs.
 */
export class LocalValidator implements ValidatorNode {
  readonly address: string;
  private keyShare: KeyShare | null = null;
  private keyInfo: Omit<PersistedValidatorKey, 'secret'> | null = null;
  private dkg: DkgParticipant | null = null;

  constructor(
    readonly index: number,
    private readonly opts: LocalValidatorOptions
  ) {
    this.address = `validator-${index}`;
    if (opts.peers[index] !== opts.identity.publicKey) {
      throw new Error(`validator ${index}: own identity key is not the one listed for it in peers`);
    }
  }

  static fromPersisted(key: PersistedValidatorKey, opts: LocalValidatorOptions) {
    const v = new LocalValidator(key.index, opts);
    v.keyShare = { index: key.index, secret: key.secret, verificationKey: key.verificationKeys[key.index] };
    const { secret: _secret, ...info } = key;
    v.keyInfo = info;
    return v;
  }

  async info(): Promise<ValidatorInfo> {
    return {
      index: this.index,
      identityKey: this.opts.identity.publicKey,
      hasKey: !!this.keyShare,
      threshold: this.keyInfo?.threshold,
      groupPublicKey: this.keyInfo?.groupPublicKey,
      verificationKeys: this.keyInfo?.verificationKeys,
    };
  }

  async requestDecryptionShares(_batchId: string, ciphertexts: string[]): Promise<DecryptionShare[]> {
    const keyShare = this.keyShare;
    if (!keyShare) throw new Error(`${this.address} has no key share`);
    return ciphertexts.map((ct) => {
      const share = partialDecrypt(keyShare, parseCiphertext(ct).R);
      // A byzantine validator substitutes a valid-looking point that is not
      // y_i·R; its DLEQ proof then fails and the coordinator discards it.
      return this.opts.byzantine ? { ...share, share: Point.BASE.toHex() } : share;
    });
  }

  // ── DKG ──────────────────────────────────────────────────────────────

  private sign<T>(domain: string, payload: T): Signed<T> {
    return signPayload(domain, payload, this.index, this.opts.identity.secretKey);
  }

  /** Signed by `expectedSigner`, under our session, from a known peer. */
  private valid(domain: string, msg: Signed<{ session: string }>, expectedSigner: number): boolean {
    const session = this.dkg?.sessionId;
    return (
      msg?.signer === expectedSigner &&
      msg.payload?.session === session &&
      verifySigned(domain, msg, this.opts.peers[expectedSigner])
    );
  }

  private session(): DkgParticipant {
    if (!this.dkg) throw new Error('no DKG session in progress');
    return this.dkg;
  }

  async dkgBegin(session: string, threshold: number, participants: number[]): Promise<SignedTransportKey> {
    if (this.keyShare) throw new Error(`${this.address} already holds a key share; refusing to re-key`);
    for (const p of participants) {
      if (!this.opts.peers[p]) throw new Error(`unknown participant ${p}`);
    }
    this.dkg = new DkgParticipant(this.index, threshold, participants, session, this.opts.dkgFaults);
    return this.sign(DOMAIN.transportKey, { session, index: this.index, transportKey: this.dkg.transportPublicKey });
  }

  async dkgDeal(transportKeys: SignedTransportKey[]) {
    const dkg = this.session();
    const keys: Record<number, string> = {};
    for (const p of dkg.participants) {
      const mine = transportKeys.filter((k) => k?.payload?.index === p && this.valid(DOMAIN.transportKey, k, p));
      // A missing or forged transport key could route someone's share to an
      // attacker-controlled key. Refuse to deal at all.
      if (mine.length !== 1) throw new Error(`no valid transport key for validator ${p}; refusing to deal`);
      keys[p] = mine[0].payload.transportKey;
    }
    const { broadcast, shares } = await dkg.deal(keys);
    return {
      broadcast: this.sign(DOMAIN.broadcast, { session: dkg.sessionId, ...broadcast }),
      shares: shares.map((s) => this.sign(DOMAIN.share, { session: dkg.sessionId, ...s })),
    };
  }

  private verifiedBroadcasts(broadcasts: SignedBroadcast[]) {
    return broadcasts
      .filter((b) => this.valid(DOMAIN.broadcast, b, b?.payload?.dealer))
      .map(({ payload: { dealer, commitments } }) => ({ dealer, commitments }));
  }

  async dkgReceive(broadcasts: SignedBroadcast[], sharesForMe: SignedShare[]): Promise<SignedComplaint[]> {
    const dkg = this.session();
    const shares = sharesForMe
      .filter((s) => s?.payload?.recipient === this.index && this.valid(DOMAIN.share, s, s.payload.dealer))
      .map(({ payload: { dealer, recipient, ciphertext } }) => ({ dealer, recipient, ciphertext }));
    const complaints = await dkg.receive(this.verifiedBroadcasts(broadcasts), shares);
    return complaints.map((c) => this.sign(DOMAIN.complaint, { session: dkg.sessionId, ...c }));
  }

  async dkgRespond(complaints: SignedComplaint[]): Promise<SignedReveal[]> {
    const dkg = this.session();
    // Only answer complaints the complainer actually signed — otherwise a
    // router could forge complaints and harvest public reveals.
    const genuine = complaints
      .filter((c) => this.valid(DOMAIN.complaint, c, c?.payload?.complainer))
      .map(({ payload: { complainer, dealer } }) => ({ complainer, dealer }));
    return dkg.respond(genuine).map((r) => this.sign(DOMAIN.reveal, { session: dkg.sessionId, ...r }));
  }

  /** The transcript after dropping anything not signed by its rightful sender. */
  verifyTranscript(t: SignedTranscript): DkgTranscript {
    return {
      broadcasts: this.verifiedBroadcasts(t.broadcasts),
      complaints: t.complaints
        .filter((c) => this.valid(DOMAIN.complaint, c, c?.payload?.complainer))
        .map(({ payload: { complainer, dealer } }) => ({ complainer, dealer })),
      reveals: t.reveals
        .filter((r) => this.valid(DOMAIN.reveal, r, r?.payload?.dealer))
        .map(({ payload: { dealer, recipient, share } }) => ({ dealer, recipient, share })),
    };
  }

  async dkgFinalize(signedTranscript: SignedTranscript): Promise<Signed<DkgResultStatement>> {
    const dkg = this.session();
    const transcript = this.verifyTranscript(signedTranscript);
    const { keyShare, result } = dkg.finalize(transcript);
    this.keyShare = keyShare;
    this.keyInfo = {
      index: this.index,
      threshold: result.threshold,
      participants: dkg.participants,
      groupPublicKey: result.groupPublicKey,
      verificationKeys: result.verificationKeys,
    };
    this.dkg = null;
    if (this.opts.keyFile) {
      const persisted: PersistedValidatorKey = { ...this.keyInfo, secret: keyShare.secret };
      fs.mkdirSync(path.dirname(this.opts.keyFile), { recursive: true });
      fs.writeFileSync(this.opts.keyFile, JSON.stringify(persisted, null, 2), { mode: 0o600 });
    }
    const transcriptHash = crypto.createHash('sha256').update(canonicalJson(transcript)).digest('hex');
    return this.sign(DOMAIN.result, { session: dkg.sessionId, transcriptHash, ...result });
  }
}
