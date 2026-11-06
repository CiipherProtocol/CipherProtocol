export type BatchStatusValue = 'created' | 'submitted' | 'settled' | 'failed';

export interface Batch {
  id: string;
  order_ids: string[];
  status: BatchStatusValue;
  /** sha256 commitment to the batch's ordered ciphertexts, sealed on-chain before decryption. */
  content_hash: string | null;
  /** Stellar transaction that sealed it (null on a local dev ledger). */
  commitment_tx: string | null;
  created_at: string;
}

export interface BatchStatsSummary {
  total: number;
  pending: number;
  settled: number;
}
