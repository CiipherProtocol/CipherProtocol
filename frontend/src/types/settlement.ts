export interface SettlementResult {
  user: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  fee: string;
}

export interface Settlement {
  id: string;
  batch_id: string;
  results: SettlementResult[];
  status: 'settled' | 'failed';
  settled_at: string;
}
