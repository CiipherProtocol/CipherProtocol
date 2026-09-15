export type OrderStatusValue = 'pending' | 'batched' | 'settled' | 'failed';

export interface Order {
  id: string;
  user_address: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
  status: OrderStatusValue;
  batch_id?: string;
  created_at: string;
}

export interface EncryptedOrderPayload {
  user: string;
  encrypted_data: string;
  threshold_pubkey: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
  nonce: number;
}

export interface SwapOrderInput {
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
  nonce: number;
}
