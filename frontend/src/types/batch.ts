export type BatchStatusValue = 'created' | 'submitted' | 'settled' | 'failed';

export interface Batch {
  id: string;
  order_ids: string[];
  status: BatchStatusValue;
  created_at: string;
}

export interface BatchStatsSummary {
  total: number;
  pending: number;
  settled: number;
}
