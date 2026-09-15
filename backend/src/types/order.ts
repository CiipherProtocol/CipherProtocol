export type OrderStatus = 'pending' | 'batched' | 'settled' | 'failed';

export interface SubmitOrderBody {
  user: string;
  encrypted_data: string;
  threshold_pubkey: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
  nonce: number;
}

export interface DecryptedOrder {
  user: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
}
