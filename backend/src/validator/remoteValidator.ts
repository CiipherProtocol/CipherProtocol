import fs from 'fs';
import { DecryptionShare } from '../crypto/threshold';
import { Signed } from '../crypto/signing';
import {
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

export interface ClusterMember {
  index: number;
  url: string;
  /** ed25519 identity public key, hex — pinned so a swapped validator is detected. */
  identityKey: string;
  /** Bearer token this coordinator presents to that validator. */
  apiToken: string;
}

export interface ClusterFile {
  validators: ClusterMember[];
}

export function loadClusterFile(file: string): ClusterFile {
  const cluster = JSON.parse(fs.readFileSync(file, 'utf8')) as ClusterFile;
  const seen = new Set<number>();
  for (const v of cluster.validators ?? []) {
    if (!Number.isInteger(v.index) || v.index < 1 || seen.has(v.index)) throw new Error(`bad validator index ${v.index}`);
    if (!/^https?:\/\//.test(v.url)) throw new Error(`validator ${v.index}: bad url`);
    if (!/^[0-9a-f]{64}$/.test(v.identityKey)) throw new Error(`validator ${v.index}: bad identityKey`);
    if (!v.apiToken || v.apiToken.length < 32) throw new Error(`validator ${v.index}: apiToken must be ≥ 32 chars`);
    seen.add(v.index);
  }
  if (seen.size === 0) throw new Error(`${file} lists no validators`);
  return cluster;
}

const TIMEOUT_MS = 15_000;

/** HTTP client for a validator process (see validator/server.ts). */
export class RemoteValidator implements ValidatorNode {
  readonly index: number;
  readonly address: string;

  constructor(private readonly member: ClusterMember) {
    this.index = member.index;
    this.address = `validator-${member.index}`;
  }

  private async call<T>(method: 'GET' | 'POST', route: string, body?: unknown): Promise<T> {
    const res = await fetch(new URL(route, this.member.url), {
      method,
      headers: { authorization: `Bearer ${this.member.apiToken}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(`${this.address} ${route}: ${res.status} ${data.error ?? ''}`.trim());
    return data as T;
  }

  info() {
    return this.call<ValidatorInfo>('GET', '/v1/info');
  }

  requestDecryptionShares(batchId: string, ciphertexts: string[]) {
    return this.call<DecryptionShare[]>('POST', '/v1/decryption-shares', { batchId, ciphertexts });
  }

  dkgBegin(session: string, threshold: number, participants: number[]) {
    return this.call<SignedTransportKey>('POST', '/v1/dkg/begin', { session, threshold, participants });
  }

  dkgDeal(transportKeys: SignedTransportKey[]) {
    return this.call<{ broadcast: SignedBroadcast; shares: SignedShare[] }>('POST', '/v1/dkg/deal', { transportKeys });
  }

  dkgReceive(broadcasts: SignedBroadcast[], sharesForMe: SignedShare[]) {
    return this.call<SignedComplaint[]>('POST', '/v1/dkg/receive', { broadcasts, sharesForMe });
  }

  dkgRespond(complaints: SignedComplaint[]) {
    return this.call<SignedReveal[]>('POST', '/v1/dkg/respond', { complaints });
  }

  dkgFinalize(transcript: SignedTranscript) {
    return this.call<Signed<DkgResultStatement>>('POST', '/v1/dkg/finalize', { transcript });
  }
}
