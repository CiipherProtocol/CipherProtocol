import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { parseCiphertext } from '../crypto/orderCipher';
import { DecryptionShare, KeyShare, Point, partialDecrypt } from '../crypto/threshold';
import {
  Complaint,
  DealerBroadcast,
  DkgFaults,
  DkgParticipant,
  DkgPublicResult,
  DkgTranscript,
  EncryptedShare,
  Reveal,
  computePublicResult,
} from '../crypto/dkg';
import logger from '../utils/logger';

/**
 * A validator as the coordinator sees it. Every method is async and
 * per-validator, and nothing in it exposes a secret: swapping
 * `SimulatedValidator` for an HTTP/gRPC client to a remote validator
 * process doesn't touch validatorService or runDkg.
 */
export interface ValidatorNode {
  readonly index: number;
  readonly address: string;
  /** Y_i = y_i·G, known after DKG (or after loading a persisted share). */
  readonly verificationKey: string;
  requestDecryptionShares(ciphertexts: string[]): Promise<DecryptionShare[]>;

  dkgBegin(sessionId: string, threshold: number, participants: number[]): Promise<string>;
  dkgDeal(transportKeys: Record<number, string>): Promise<{ broadcast: DealerBroadcast; shares: EncryptedShare[] }>;
  dkgReceive(broadcasts: DealerBroadcast[], sharesForMe: EncryptedShare[]): Promise<Complaint[]>;
  dkgRespond(complaints: Complaint[]): Promise<Reveal[]>;
  dkgFinalize(transcript: DkgTranscript): Promise<DkgPublicResult>;
}

interface PersistedValidatorKey {
  index: number;
  threshold: number;
  participants: number[];
  groupPublicKey: string;
  verificationKeys: Record<number, string>;
  secret: string;
}

export interface SimulatedValidatorOptions {
  /** Return invalid decryption shares (DLEQ verification must reject them). */
  byzantine?: boolean;
  /** Misbehave during DKG. */
  dkgFaults?: DkgFaults;
  /** Persist this validator's own share here after DKG ('' = memory only). */
  keyFile?: string;
}

/**
 * SIMULATED: runs inside the backend process. It still keeps exactly one
 * secret share, which only it ever sees: the DKG delivers that share
 * encrypted to this validator's transport key, and it is stored in this
 * validator's own key file.
 */
export class SimulatedValidator implements ValidatorNode {
  readonly address: string;
  private keyShare: KeyShare | null = null;
  private dkg: DkgParticipant | null = null;

  constructor(
    readonly index: number,
    private readonly opts: SimulatedValidatorOptions = {}
  ) {
    this.address = `sim-validator-${index}`;
  }

  static fromPersisted(key: PersistedValidatorKey, opts: SimulatedValidatorOptions = {}) {
    const v = new SimulatedValidator(key.index, opts);
    v.keyShare = { index: key.index, secret: key.secret, verificationKey: key.verificationKeys[key.index] };
    return v;
  }

  get verificationKey(): string {
    if (!this.keyShare) throw new Error(`${this.address} has no key share yet (DKG not run)`);
    return this.keyShare.verificationKey;
  }

  async requestDecryptionShares(ciphertexts: string[]): Promise<DecryptionShare[]> {
    if (!this.keyShare) throw new Error(`${this.address} has no key share`);
    const keyShare = this.keyShare;
    return ciphertexts.map((ct) => {
      const share = partialDecrypt(keyShare, parseCiphertext(ct).R);
      // A byzantine validator substitutes a valid-looking point that is not
      // y_i·R; its DLEQ proof then fails and the coordinator discards it.
      return this.opts.byzantine ? { ...share, share: Point.BASE.toHex() } : share;
    });
  }

  async dkgBegin(sessionId: string, threshold: number, participants: number[]) {
    this.dkg = new DkgParticipant(this.index, threshold, participants, sessionId, this.opts.dkgFaults);
    return this.dkg.transportPublicKey;
  }

  private session(): DkgParticipant {
    if (!this.dkg) throw new Error('no DKG session in progress');
    return this.dkg;
  }

  async dkgDeal(transportKeys: Record<number, string>) {
    return this.session().deal(transportKeys);
  }

  async dkgReceive(broadcasts: DealerBroadcast[], sharesForMe: EncryptedShare[]) {
    return this.session().receive(broadcasts, sharesForMe);
  }

  async dkgRespond(complaints: Complaint[]) {
    return this.session().respond(complaints);
  }

  async dkgFinalize(transcript: DkgTranscript) {
    const session = this.session();
    const { keyShare, result } = session.finalize(transcript);
    this.keyShare = keyShare;
    this.dkg = null;
    if (this.opts.keyFile) {
      const persisted: PersistedValidatorKey = {
        index: this.index,
        threshold: result.threshold,
        participants: session.participants,
        groupPublicKey: result.groupPublicKey,
        verificationKeys: result.verificationKeys,
        secret: keyShare.secret,
      };
      fs.mkdirSync(path.dirname(this.opts.keyFile), { recursive: true });
      fs.writeFileSync(this.opts.keyFile, JSON.stringify(persisted, null, 2), { mode: 0o600 });
    }
    return result;
  }
}

/**
 * Drives the DKG rounds. The coordinator only routes messages: shares
 * travel encrypted to their recipient, so it never sees a secret. It ends by
 * checking that every validator derived the same public result.
 */
export async function runDkg(nodes: ValidatorNode[], threshold: number, sessionId = crypto.randomUUID()) {
  const participants = nodes.map((n) => n.index);
  const transportKeys: Record<number, string> = {};
  await Promise.all(
    nodes.map(async (n) => {
      transportKeys[n.index] = await n.dkgBegin(sessionId, threshold, participants);
    })
  );

  // A dealer that fails to deal simply ends up outside QUAL.
  const dealt = await Promise.allSettled(nodes.map((n) => n.dkgDeal(transportKeys)));
  const broadcasts: DealerBroadcast[] = [];
  const shares: EncryptedShare[] = [];
  dealt.forEach((d, k) => {
    if (d.status === 'fulfilled') {
      broadcasts.push(d.value.broadcast);
      shares.push(...d.value.shares);
    } else {
      logger.warn(`[dkg ${sessionId}] validator ${nodes[k].index} failed to deal: ${d.reason}`);
    }
  });

  const complaints = (
    await Promise.all(nodes.map((n) => n.dkgReceive(broadcasts, shares.filter((s) => s.recipient === n.index))))
  ).flat();
  const reveals = (await Promise.all(nodes.map((n) => n.dkgRespond(complaints)))).flat();
  const transcript: DkgTranscript = { broadcasts, complaints, reveals };

  const expected = computePublicResult(transcript, participants, threshold);
  const results = await Promise.all(nodes.map((n) => n.dkgFinalize(transcript)));
  for (const r of results) {
    if (r.groupPublicKey !== expected.groupPublicKey) throw new Error('DKG failed: validators disagree on the group key');
  }
  for (const c of complaints) {
    const resolved = expected.qualified.includes(c.dealer);
    logger.warn(
      `[dkg ${sessionId}] validator ${c.complainer} complained about dealer ${c.dealer}: ` +
        (resolved ? 'resolved by a valid public reveal' : 'dealer disqualified')
    );
  }
  return { result: expected, transcript };
}

export interface ValidatorNetwork {
  threshold: number;
  groupPublicKey: string;
  validators: ValidatorNode[];
}

let network: ValidatorNetwork | null = null;
let initializing: Promise<ValidatorNetwork> | null = null;

const keyFileFor = (dir: string, index: number) => (dir ? path.join(dir, `validator-${index}.json`) : '');

export interface CreateNetworkOptions {
  count: number;
  threshold: number;
  byzantine?: number[];
  dkgFaults?: Record<number, DkgFaults>;
  keyDir?: string;
}

/** Spins up `count` simulated validators and has them run a fresh DKG. */
export async function createSimulatedNetwork(opts: CreateNetworkOptions): Promise<ValidatorNetwork & { dkg: DkgPublicResult }> {
  const validators = Array.from(
    { length: opts.count },
    (_, k) =>
      new SimulatedValidator(k + 1, {
        byzantine: opts.byzantine?.includes(k + 1),
        dkgFaults: opts.dkgFaults?.[k + 1],
        keyFile: keyFileFor(opts.keyDir ?? '', k + 1),
      })
  );
  const { result, transcript } = await runDkg(validators, opts.threshold);
  if (opts.keyDir) {
    fs.writeFileSync(path.join(opts.keyDir, 'dkg-transcript.json'), JSON.stringify({ result, transcript }, null, 2));
  }
  return { threshold: result.threshold, groupPublicKey: result.groupPublicKey, validators, dkg: result };
}

function loadPersistedNetwork(dir: string): ValidatorNetwork | null {
  const files = Array.from({ length: config.validatorCount }, (_, k) => keyFileFor(dir, k + 1));
  const present = files.filter((f) => fs.existsSync(f));
  if (present.length === 0) return null;
  if (present.length !== files.length) {
    throw new Error(`${dir} has ${present.length}/${files.length} validator key files; restore them or delete all to re-run DKG`);
  }
  const keys = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as PersistedValidatorKey);
  const { groupPublicKey, threshold } = keys[0];
  if (keys.some((k) => k.groupPublicKey !== groupPublicKey || k.threshold !== threshold)) {
    throw new Error(`validator key files in ${dir} come from different DKG sessions`);
  }
  if (threshold !== config.validatorThreshold) {
    throw new Error(
      `persisted keys are ${threshold}-of-${keys.length} but config asks for ${config.validatorThreshold}-of-${config.validatorCount}; ` +
        'delete the key directory to re-run DKG (pending orders become undecryptable)'
    );
  }
  const validators = keys.map((k) =>
    SimulatedValidator.fromPersisted(k, { byzantine: config.byzantineValidators.includes(k.index) })
  );
  return { threshold, groupPublicKey, validators };
}

/** Loads persisted validator shares, or runs a fresh DKG on first start. */
export async function initValidatorNetwork(): Promise<ValidatorNetwork> {
  if (network) return network;
  initializing ??= (async () => {
    const dir = config.validatorKeyDir;
    const loaded = dir ? loadPersistedNetwork(dir) : null;
    if (loaded) return loaded;
    const created = await createSimulatedNetwork({
      count: config.validatorCount,
      threshold: config.validatorThreshold,
      byzantine: config.byzantineValidators,
      keyDir: dir,
    });
    logger.info(
      `DKG complete: ${created.threshold}-of-${created.validators.length}, ` +
        `${created.dkg.qualified.length} qualified dealers${dir ? `, shares stored per validator in ${dir}` : ''}`
    );
    return created;
  })().finally(() => {
    initializing = null;
  });
  network = await initializing;
  return network;
}

export function getValidatorNetwork(): ValidatorNetwork {
  if (!network) throw new Error('validator network not initialized; call initValidatorNetwork() first');
  return network;
}

/** Test hook: swap in a specific network (or reset so the next init reloads from config). */
export function setValidatorNetwork(next: ValidatorNetwork | null): void {
  network = next;
}
