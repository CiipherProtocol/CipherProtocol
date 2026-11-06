export type OrderStatus = 'pending' | 'batched' | 'settled' | 'failed';

/**
 * What a client submits. Deliberately contains NO plaintext order details —
 * tokens and amounts live only inside `encrypted_data` until the validator
 * set threshold-decrypts the batch the order lands in.
 */
export interface SubmitOrderBody {
  encrypted_data: string;
  threshold_pubkey: string;
  nonce: number;
}

/** The JSON inside `encrypted_data` (amounts are integer strings in base units). */
export interface DecryptedOrder {
  user: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
}
