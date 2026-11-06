export type OrderStatusValue = 'pending' | 'batched' | 'settled' | 'failed';

/**
 * An order as the backend reports it. Token/amount fields are null until the
 * validator set threshold-decrypts the order's batch — the backend never
 * sees them before that. Amounts are integer strings in base units.
 */
export interface Order {
  id: string;
  user_address: string;
  token_in: string | null;
  token_out: string | null;
  amount_in: string | null;
  min_amount_out: string | null;
  amount_out: string | null;
  failure_reason: string | null;
  status: OrderStatusValue;
  batch_id?: string;
  created_at: string;
}

/** What gets POSTed: ciphertext only, no plaintext order details. */
export interface EncryptedOrderPayload {
  user: string;
  encrypted_data: string;
  threshold_pubkey: string;
  nonce: number;
}

/** The plaintext sealed inside `encrypted_data`. */
export interface SwapOrderInput {
  user: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
  nonce: number;
}
