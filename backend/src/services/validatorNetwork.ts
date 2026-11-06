import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { DkgFaults, DkgPublicResult } from '../crypto/dkg';
import { generateIdentity, verifySigned } from '../crypto/signing';
import { LocalValidator, PersistedValidatorKey } from '../validator/localValidator';
import { DOMAIN, SignedBroadcast, SignedShare, SignedTranscript, ValidatorNode } from '../validator/protocol';
import { RemoteValidator, loadClusterFile } from '../validator/remoteValidator';
import logger from '../utils/logger';

export type { ValidatorNode };

/**
 * Drives the DKG rounds. The coordinator only routes messages, and it is
 * treated as untrusted: shares travel encrypted to their recipient, every
 * message is signed by its sender, and validators refuse to deal or
 * complain in ways a malicious router could exploit. It ends by checking
 * every validator signed the same result and transcript hash.
 */
export async function runDkg(
  nodes: ValidatorNode[],
  threshold: number,
  identityKeys: Record<number, string>,
  session = crypto.randomUUID()
) {
  const participants = nodes.map((n) => n.index);
  const transportKeys = await Promise.all(nodes.map((n) => n.dkgBegin(session, threshold, participants)));

  // A dealer that fails to deal simply ends up outside QUAL.
  const dealt = await Promise.allSettled(nodes.map((n) => n.dkgDeal(transportKeys)));
  const broadcasts: SignedBroadcast[] = [];
  const shares: SignedShare[] = [];
  dealt.forEach((d, k) => {
    if (d.status === 'fulfilled') {
      broadcasts.push(d.value.broadcast);
      shares.push(...d.value.shares);
    } else {
      logger.warn(`[dkg ${session}] validator ${nodes[k].index} did not deal: ${d.reason}`);
    }
  });
  if (broadcasts.length < threshold) throw new Error(`DKG failed: only ${broadcasts.length} validators dealt`);

  const complaints = (
    await Promise.all(nodes.map((n) => n.dkgReceive(broadcasts, shares.filter((s) => s.payload.recipient === n.index))))
  ).flat();
  const reveals = (await Promise.all(nodes.map((n) => n.dkgRespond(complaints)))).flat();
  const transcript: SignedTranscript = { broadcasts, complaints, reveals };

  const statements = await Promise.all(nodes.map((n) => n.dkgFinalize(transcript)));
  const first = statements[0].payload;
  for (const s of statements) {
    if (!verifySigned(DOMAIN.result, s, identityKeys[s.signer])) {
      throw new Error(`DKG failed: bad result signature from validator ${s.signer}`);
    }
    if (s.payload.groupPublicKey !== first.groupPublicKey || s.payload.transcriptHash !== first.transcriptHash) {
      throw new Error('DKG failed: validators disagree on the result');
    }
  }
  for (const c of complaints) {
    const resolved = first.qualified.includes(c.payload.dealer);
    logger.warn(
      `[dkg ${session}] validator ${c.payload.complainer} complained about dealer ${c.payload.dealer}: ` +
        (resolved ? 'resolved by a valid public reveal' : 'dealer disqualified')
    );
  }
  const result: DkgPublicResult = {
    threshold: first.threshold,
    qualified: first.qualified,
    groupPublicKey: first.groupPublicKey,
    verificationKeys: first.verificationKeys,
  };
  return { result, transcript, statements };
}

export interface ValidatorNetwork {
  threshold: number;
  groupPublicKey: string;
  verificationKeys: Record<number, string>;
  validators: ValidatorNode[];
  mode: 'local' | 'remote';
}

let network: ValidatorNetwork | null = null;
let initializing: Promise<ValidatorNetwork> | null = null;

const keyFileFor = (dir: string, index: number) => (dir ? path.join(dir, `validator-${index}.json`) : '');

export interface CreateLocalNetworkOptions {
  count: number;
  threshold: number;
  byzantine?: number[];
  dkgFaults?: Record<number, DkgFaults>;
  keyDir?: string;
}

/** In-process validators (dev/tests): fresh identities, then a real DKG among them. */
export async function createLocalNetwork(opts: CreateLocalNetworkOptions) {
  const identities = Array.from({ length: opts.count }, () => generateIdentity());
  const peers = Object.fromEntries(identities.map((id, k) => [k + 1, id.publicKey]));
  const validators = identities.map(
    (identity, k) =>
      new LocalValidator(k + 1, {
        identity,
        peers,
        byzantine: opts.byzantine?.includes(k + 1),
        dkgFaults: opts.dkgFaults?.[k + 1],
        keyFile: keyFileFor(opts.keyDir ?? '', k + 1),
      })
  );
  const { result, transcript } = await runDkg(validators, opts.threshold, peers);
  if (opts.keyDir) {
    fs.writeFileSync(path.join(opts.keyDir, 'dkg-transcript.json'), JSON.stringify({ result, transcript }, null, 2));
  }
  const net: ValidatorNetwork & { dkg: DkgPublicResult; identities: typeof identities } = {
    threshold: result.threshold,
    groupPublicKey: result.groupPublicKey,
    verificationKeys: result.verificationKeys,
    validators,
    mode: 'local',
    dkg: result,
    identities,
  };
  return net;
}

function loadLocalNetwork(dir: string): ValidatorNetwork | null {
  const files = Array.from({ length: config.validatorCount }, (_, k) => keyFileFor(dir, k + 1));
  const present = files.filter((f) => fs.existsSync(f));
  if (present.length === 0) return null;
  if (present.length !== files.length) {
    throw new Error(`${dir} has ${present.length}/${files.length} validator key files; restore them or delete all to re-run DKG`);
  }
  const keys = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as PersistedValidatorKey);
  const { groupPublicKey, threshold, verificationKeys } = keys[0];
  if (keys.some((k) => k.groupPublicKey !== groupPublicKey || k.threshold !== threshold)) {
    throw new Error(`validator key files in ${dir} come from different DKG sessions`);
  }
  if (threshold !== config.validatorThreshold) {
    throw new Error(
      `persisted keys are ${threshold}-of-${keys.length} but config asks for ${config.validatorThreshold}-of-${config.validatorCount}; ` +
        'delete the key directory to re-run DKG (pending orders become undecryptable)'
    );
  }
  // Identity keys only matter for running a DKG; reloaded local validators get fresh ones.
  const identities = keys.map(() => generateIdentity());
  const peers = Object.fromEntries(identities.map((id, k) => [keys[k].index, id.publicKey]));
  const validators = keys.map((k, n) =>
    LocalValidator.fromPersisted(k, {
      identity: identities[n],
      peers,
      byzantine: config.byzantineValidators.includes(k.index),
    })
  );
  return { threshold, groupPublicKey, verificationKeys, validators, mode: 'local' };
}

/**
 * Remote validators: each is its own process holding its own share. Uses
 * the existing key if the validators already agree on one; runs a DKG over
 * HTTP if none has a key yet; refuses a mixed state.
 */
export async function connectRemoteNetwork(clusterFile: string, threshold: number): Promise<ValidatorNetwork> {
  const cluster = loadClusterFile(clusterFile);
  const validators = cluster.validators.map((v) => new RemoteValidator(v));
  const identityKeys = Object.fromEntries(cluster.validators.map((v) => [v.index, v.identityKey]));

  const infos = await Promise.allSettled(validators.map((v) => v.info()));
  const reachable = infos.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  for (const info of reachable) {
    if (info.identityKey !== identityKeys[info.index]) {
      throw new Error(`validator ${info.index} reports identity ${info.identityKey}, cluster file expects ${identityKeys[info.index]}`);
    }
  }
  const keyed = reachable.filter((i) => i.hasKey);

  if (keyed.length === 0) {
    if (reachable.length !== validators.length) {
      throw new Error(`DKG needs all ${validators.length} validators reachable; only ${reachable.length} are`);
    }
    const { result } = await runDkg(validators, threshold, identityKeys);
    logger.info(`DKG over HTTP complete: ${threshold}-of-${validators.length}, ${result.qualified.length} qualified dealers`);
    return { ...result, validators, mode: 'remote' };
  }

  if (keyed.length !== reachable.length) {
    throw new Error('some validators hold a key share and others do not; re-key all of them or restore their key files');
  }
  const [ref] = keyed;
  if (keyed.some((i) => i.groupPublicKey !== ref.groupPublicKey || i.threshold !== ref.threshold)) {
    throw new Error('remote validators hold shares from different DKG sessions');
  }
  if (keyed.length < ref.threshold!) {
    throw new Error(`only ${keyed.length} validators reachable, ${ref.threshold} needed to decrypt`);
  }
  if (keyed.length < validators.length) {
    logger.warn(`${validators.length - keyed.length} validator(s) unreachable at startup; continuing with ${keyed.length}`);
  }
  return {
    threshold: ref.threshold!,
    groupPublicKey: ref.groupPublicKey!,
    verificationKeys: ref.verificationKeys!,
    validators,
    mode: 'remote',
  };
}

/** Remote cluster if VALIDATOR_CLUSTER_FILE is set; otherwise in-process validators (load or DKG). */
export async function initValidatorNetwork(): Promise<ValidatorNetwork> {
  if (network) return network;
  initializing ??= (async () => {
    if (config.validatorClusterFile) {
      return connectRemoteNetwork(config.validatorClusterFile, config.validatorThreshold);
    }
    const dir = config.validatorKeyDir;
    const loaded = dir ? loadLocalNetwork(dir) : null;
    if (loaded) return loaded;
    const created = await createLocalNetwork({
      count: config.validatorCount,
      threshold: config.validatorThreshold,
      byzantine: config.byzantineValidators,
      keyDir: dir,
    });
    logger.info(
      `DKG complete (in-process validators): ${created.threshold}-of-${created.validators.length}, ` +
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
