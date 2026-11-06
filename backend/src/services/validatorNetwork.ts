import fs from 'fs';
import path from 'path';
import { ristretto255 } from '@noble/curves/ed25519';
import { config } from '../config';
import { parseCiphertext } from '../crypto/orderCipher';
import {
  DecryptionShare,
  KeyShare,
  ThresholdKeySet,
  generateKeySet,
  partialDecrypt,
} from '../crypto/threshold';
import logger from '../utils/logger';

/**
 * One validator. Holds exactly one secret key share and nothing else — it
 * cannot decrypt any order on its own, only contribute y_i·R plus a proof.
 *
 * SIMULATED: every validator currently lives in this process (keys loaded
 * from one file). The interface is deliberately async and per-validator so
 * replacing `SimulatedValidator` with an HTTP/gRPC client for a remote
 * validator doesn't touch the coordination logic in validatorService.
 */
export interface ValidatorNode {
  readonly index: number;
  readonly address: string;
  readonly verificationKey: string;
  requestDecryptionShares(ciphertexts: string[]): Promise<DecryptionShare[]>;
}

export class SimulatedValidator implements ValidatorNode {
  readonly index: number;
  readonly address: string;
  readonly verificationKey: string;

  constructor(
    private readonly keyShare: KeyShare,
    /** Fault injection for tests/demos: return wrong shares (proofs must catch it). */
    private readonly byzantine = false
  ) {
    this.index = keyShare.index;
    this.address = `sim-validator-${keyShare.index}`;
    this.verificationKey = keyShare.verificationKey;
  }

  async requestDecryptionShares(ciphertexts: string[]): Promise<DecryptionShare[]> {
    return ciphertexts.map((ct) => {
      const share = partialDecrypt(this.keyShare, parseCiphertext(ct).R);
      // A byzantine validator substitutes a valid-looking point that is not
      // y_i·R; its DLEQ proof then fails and the coordinator discards it.
      return this.byzantine ? { ...share, share: ristretto255.Point.BASE.toHex() } : share;
    });
  }
}

export interface ValidatorNetwork {
  threshold: number;
  groupPublicKey: string;
  validators: ValidatorNode[];
}

let network: ValidatorNetwork | null = null;

function loadOrCreateKeySet(): ThresholdKeySet {
  const file = config.validatorKeyFile;
  if (file && fs.existsSync(file)) {
    const keySet = JSON.parse(fs.readFileSync(file, 'utf8')) as ThresholdKeySet;
    if (keySet.shares.length !== config.validatorCount || keySet.threshold !== config.validatorThreshold) {
      throw new Error(
        `${file} holds a ${keySet.threshold}-of-${keySet.shares.length} key set but config asks for ` +
          `${config.validatorThreshold}-of-${config.validatorCount}; delete it to re-key (pending orders become undecryptable)`
      );
    }
    return keySet;
  }

  const keySet = generateKeySet(config.validatorThreshold, config.validatorCount);
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(keySet, null, 2), { mode: 0o600 });
    logger.warn(
      `Generated a new simulated ${keySet.threshold}-of-${keySet.shares.length} validator key set at ${file}. ` +
        'Trusted-dealer keygen is for development only.'
    );
  }
  return keySet;
}

export function getValidatorNetwork(): ValidatorNetwork {
  if (network) return network;
  const keySet = loadOrCreateKeySet();
  network = {
    threshold: keySet.threshold,
    groupPublicKey: keySet.groupPublicKey,
    validators: keySet.shares.map(
      (share) => new SimulatedValidator(share, config.byzantineValidators.includes(share.index))
    ),
  };
  return network;
}

/** Test hook: swap in a specific network (or reset to lazy-load from config). */
export function setValidatorNetwork(next: ValidatorNetwork | null): void {
  network = next;
}
