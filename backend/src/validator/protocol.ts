import { DecryptionShare } from '../crypto/threshold';
import { Complaint, DealerBroadcast, DkgPublicResult, EncryptedShare, Reveal } from '../crypto/dkg';
import { Signed } from '../crypto/signing';

/** Signature domains, one per message kind, so a signature can't be replayed as a different message. */
export const DOMAIN = {
  transportKey: 'dkg/transport-key/v1',
  broadcast: 'dkg/broadcast/v1',
  share: 'dkg/share/v1',
  complaint: 'dkg/complaint/v1',
  reveal: 'dkg/reveal/v1',
  result: 'dkg/result/v1',
} as const;

type InSession<T> = T & { session: string };

export interface TransportKey {
  session: string;
  index: number;
  transportKey: string;
}
export type SignedTransportKey = Signed<TransportKey>;
export type SignedBroadcast = Signed<InSession<DealerBroadcast>>;
export type SignedShare = Signed<InSession<EncryptedShare>>;
export type SignedComplaint = Signed<InSession<Complaint>>;
export type SignedReveal = Signed<InSession<Reveal>>;

export interface SignedTranscript {
  broadcasts: SignedBroadcast[];
  complaints: SignedComplaint[];
  reveals: SignedReveal[];
}

export interface DkgResultStatement extends DkgPublicResult {
  session: string;
  /** sha256 of the canonical verified transcript — lets validators detect a coordinator showing them different views. */
  transcriptHash: string;
}

export interface ValidatorInfo {
  index: number;
  identityKey: string;
  hasKey: boolean;
  threshold?: number;
  groupPublicKey?: string;
  verificationKeys?: Record<number, string>;
}

/**
 * A validator as the coordinator sees it — local object or remote process.
 * Nothing here exposes a secret, and every DKG output is signed by the
 * validator's identity key.
 */
export interface ValidatorNode {
  readonly index: number;
  readonly address: string;
  info(): Promise<ValidatorInfo>;
  requestDecryptionShares(batchId: string, ciphertexts: string[]): Promise<DecryptionShare[]>;

  dkgBegin(session: string, threshold: number, participants: number[]): Promise<SignedTransportKey>;
  dkgDeal(transportKeys: SignedTransportKey[]): Promise<{ broadcast: SignedBroadcast; shares: SignedShare[] }>;
  dkgReceive(broadcasts: SignedBroadcast[], sharesForMe: SignedShare[]): Promise<SignedComplaint[]>;
  dkgRespond(complaints: SignedComplaint[]): Promise<SignedReveal[]>;
  dkgFinalize(transcript: SignedTranscript): Promise<Signed<DkgResultStatement>>;
}
