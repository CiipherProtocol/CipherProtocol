/**
 * Distributed key generation (Joint-Feldman with complaints, after
 * Pedersen '91 / Gennaro–Jarecki–Krawczyk–Rabin '99).
 *
 * Every validator j ends up with a secret share y_j of a group secret
 * y = Σ_{i∈QUAL} a_{i,0} that no party — validator, coordinator, or the
 * backend operator — ever holds. Rounds:
 *
 *  1. Deal.     Validator i picks a random degree-(t−1) polynomial f_i,
 *               broadcasts Feldman commitments C_{i,k} = a_{i,k}·G, and
 *               sends s_{i→j} = f_i(j) to each j, *encrypted to j's
 *               transport key* (the same ElGamal+AES-GCM cipher used for
 *               orders), so whoever routes the messages learns nothing.
 *  2. Verify.   j decrypts its shares and checks
 *               s_{i→j}·G == Σ_k j^k·C_{i,k}. Any failure → complaint(i).
 *  3. Respond.  An accused dealer must publish s_{i→j}. Everyone checks it
 *               against i's commitments; a dealer that fails (or stays
 *               silent) is disqualified.
 *  4. Finalize. QUAL = dealers with well-formed commitments and no
 *               unanswered complaint. Then
 *                 y_j = Σ_{i∈QUAL} s_{i→j}       (secret, j only)
 *                 Y   = Σ_{i∈QUAL} C_{i,0}       (public group key)
 *                 Y_j = Σ_{i∈QUAL} Σ_k j^k·C_{i,k}  (public verification keys)
 *
 * Known limitation (documented in docs/THRESHOLD_ENCRYPTION.md): plain
 * Joint-Feldman lets a rushing dealer bias the *distribution* of Y (not learn
 * y). GJKR's Pedersen-commitment first round removes that bias; it's a
 * contained follow-up since only round 1 changes.
 */
import {
  decryptWithSharedPoint,
  encryptOrder,
  parseCiphertext,
  parsePoint,
  randomScalar,
} from './orderCipher';
import { KeyShare, L, Point, RistrettoPoint, hexToScalar, mod, scalarToHex } from './threshold';

export interface DealerBroadcast {
  dealer: number;
  /** Feldman commitments C_{dealer,0..t−1}, hex points. */
  commitments: string[];
}

export interface EncryptedShare {
  dealer: number;
  recipient: number;
  ciphertext: string;
}

export interface Complaint {
  complainer: number;
  dealer: number;
}

export interface Reveal {
  dealer: number;
  recipient: number;
  share: string;
}

export interface DkgTranscript {
  broadcasts: DealerBroadcast[];
  complaints: Complaint[];
  reveals: Reveal[];
}

/** Public outcome every honest participant computes identically. */
export interface DkgPublicResult {
  threshold: number;
  qualified: number[];
  groupPublicKey: string;
  verificationKeys: Record<number, string>;
}

/** Binds an encrypted share to (session, dealer, recipient): no replay across sessions or misrouting. */
const shareContext = (sessionId: string, dealer: number, recipient: number) =>
  `cipher-protocol/dkg/${sessionId}/${dealer}->${recipient}`;

/**
 * Σ_k j^k·C_k — the commitment to f(j). Every input is public, so the
 * faster variable-time multiply is safe here (no secret-dependent timing).
 */
export function evalCommitments(commitments: RistrettoPoint[], j: number): RistrettoPoint {
  let acc = Point.ZERO;
  let power = 1n;
  for (const C of commitments) {
    acc = acc.add(C.multiplyUnsafe(power));
    power = mod(power * BigInt(j));
  }
  return acc;
}

function parseCommitments(b: DealerBroadcast | undefined, threshold: number): RistrettoPoint[] | null {
  if (!b || !Array.isArray(b.commitments) || b.commitments.length !== threshold) return null;
  try {
    return b.commitments.map(parsePoint);
  } catch {
    return null;
  }
}

function shareMatches(shareHex: string, commitments: RistrettoPoint[], recipient: number): boolean {
  try {
    return Point.BASE.multiply(hexToScalar(shareHex)).equals(evalCommitments(commitments, recipient));
  } catch {
    return false;
  }
}

/**
 * Deterministic from the public transcript, so every honest participant
 * (and any auditor) derives the same QUAL set and keys.
 */
export function computePublicResult(
  transcript: DkgTranscript,
  participants: number[],
  threshold: number
): DkgPublicResult {
  const commitmentsBy = new Map<number, RistrettoPoint[]>();
  for (const dealer of participants) {
    const own = transcript.broadcasts.filter((b) => b.dealer === dealer);
    const parsed = own.length === 1 ? parseCommitments(own[0], threshold) : null; // equivocation → out
    if (parsed) commitmentsBy.set(dealer, parsed);
  }

  const qualified = participants.filter((dealer) => {
    const C = commitmentsBy.get(dealer);
    if (!C) return false;
    const against = transcript.complaints.filter((c) => c.dealer === dealer && participants.includes(c.complainer));
    return against.every((c) =>
      transcript.reveals.some(
        (r) => r.dealer === dealer && r.recipient === c.complainer && shareMatches(r.share, C, c.complainer)
      )
    );
  });

  if (qualified.length < threshold) {
    throw new Error(`DKG failed: only ${qualified.length} qualified dealers, need at least ${threshold}`);
  }

  let Y = Point.ZERO;
  for (const d of qualified) Y = Y.add(commitmentsBy.get(d)![0]);
  if (Y.equals(Point.ZERO)) throw new Error('DKG failed: group key is the identity');

  const verificationKeys: Record<number, string> = {};
  for (const j of participants) {
    let Yj = Point.ZERO;
    for (const d of qualified) Yj = Yj.add(evalCommitments(commitmentsBy.get(d)!, j));
    verificationKeys[j] = Yj.toHex();
  }

  return { threshold, qualified, groupPublicKey: Y.toHex(), verificationKeys };
}

export interface DkgFaults {
  /** Send corrupted shares to these recipients (complaints follow). */
  corruptSharesTo?: number[];
  /** When accused, publish a wrong share instead of the real one (→ disqualified). */
  lieOnReveal?: boolean;
}

/**
 * One validator's side of the DKG. Holds its polynomial and transport key
 * privately; everything it returns is safe to broadcast or route.
 */
export class DkgParticipant {
  private readonly transportSecret = randomScalar();
  readonly transportPublicKey = Point.BASE.multiply(this.transportSecret).toHex();
  private readonly coeffs: bigint[];
  private readonly received = new Map<number, string>();

  constructor(
    readonly index: number,
    readonly threshold: number,
    readonly participants: number[],
    readonly sessionId: string,
    private readonly faults: DkgFaults = {}
  ) {
    if (!participants.includes(index)) throw new Error('participant not in the participant list');
    if (threshold < 1 || threshold > participants.length) throw new Error('invalid threshold');
    this.coeffs = Array.from({ length: threshold }, () => randomScalar());
  }

  private f(x: number): bigint {
    return this.coeffs.reduceRight((acc, a) => mod(acc * BigInt(x) + a), 0n);
  }

  /** Round 1. `transportKeys` maps recipient index → its transport public key. */
  async deal(transportKeys: Record<number, string>): Promise<{ broadcast: DealerBroadcast; shares: EncryptedShare[] }> {
    const broadcast = {
      dealer: this.index,
      commitments: this.coeffs.map((a) => Point.BASE.multiply(a).toHex()),
    };
    const shares = await Promise.all(
      this.participants.map(async (j) => {
        let s = this.f(j);
        if (this.faults.corruptSharesTo?.includes(j)) s = mod(s + 1n);
        const ciphertext = await encryptOrder(
          scalarToHex(s),
          transportKeys[j],
          shareContext(this.sessionId, this.index, j)
        );
        return { dealer: this.index, recipient: j, ciphertext };
      })
    );
    return { broadcast, shares };
  }

  /** Round 2. Decrypt and verify the shares addressed to us; return complaints. */
  async receive(broadcasts: DealerBroadcast[], shares: EncryptedShare[]): Promise<Complaint[]> {
    const complaints: Complaint[] = [];
    for (const dealer of this.participants) {
      const commitments = parseCommitments(
        broadcasts.find((b) => b.dealer === dealer),
        this.threshold
      );
      const msg = shares.find((s) => s.dealer === dealer && s.recipient === this.index);
      let share: string | null = null;
      if (commitments && msg) {
        try {
          const K = Point.fromBytes(parseCiphertext(msg.ciphertext).R).multiply(this.transportSecret).toBytes();
          share = await decryptWithSharedPoint(msg.ciphertext, K, shareContext(this.sessionId, dealer, this.index));
        } catch {
          share = null;
        }
      }
      if (share && commitments && shareMatches(share, commitments, this.index)) {
        this.received.set(dealer, share);
      } else if (commitments) {
        // Malformed commitments disqualify a dealer outright; no complaint needed.
        complaints.push({ complainer: this.index, dealer });
      }
    }
    return complaints;
  }

  /** Round 3. Answer complaints against us by publishing the disputed share. */
  respond(complaints: Complaint[]): Reveal[] {
    return complaints
      .filter((c) => c.dealer === this.index)
      .map((c) => {
        const s = this.faults.lieOnReveal ? mod(this.f(c.complainer) + 7n) : this.f(c.complainer);
        return { dealer: this.index, recipient: c.complainer, share: scalarToHex(s) };
      });
  }

  /** Round 4. Derive our secret share and the public result from the transcript. */
  finalize(transcript: DkgTranscript): { keyShare: KeyShare; result: DkgPublicResult } {
    const result = computePublicResult(transcript, this.participants, this.threshold);
    let y = 0n;
    for (const dealer of result.qualified) {
      const revealed = transcript.reveals.find((r) => r.dealer === dealer && r.recipient === this.index);
      const s = this.received.get(dealer) ?? revealed?.share;
      if (!s) throw new Error(`no valid share from qualified dealer ${dealer}`);
      y = mod(y + hexToScalar(s));
    }
    if (y === 0n || y >= L) throw new Error('degenerate key share');
    const verificationKey = Point.BASE.multiply(y).toHex();
    if (verificationKey !== result.verificationKeys[this.index]) {
      throw new Error('own key share is inconsistent with the public commitments');
    }
    return { keyShare: { index: this.index, secret: scalarToHex(y), verificationKey }, result };
  }
}

