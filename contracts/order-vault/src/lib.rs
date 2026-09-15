#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN,
    Env, Symbol, Vec,
};

const DAY_IN_LEDGERS: u32 = 17280;
const INSTANCE_BUMP_AMOUNT: u32 = 7 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
const BATCH_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const BATCH_LIFETIME_THRESHOLD: u32 = BATCH_BUMP_AMOUNT - DAY_IN_LEDGERS;

const ADMIN: Symbol = symbol_short!("admin");
const ORDER_CNT: Symbol = symbol_short!("ord_cnt");
const ORDERS: Symbol = symbol_short!("orders");
const BATCH: Symbol = symbol_short!("batch");

/// A swap order encrypted with the validator set's threshold public key.
/// The vault (and any single validator) can only ever see ciphertext.
#[contracttype]
#[derive(Clone)]
pub struct EncryptedOrder {
    pub order_id: u64,
    pub user: Address,
    pub encrypted_data: Bytes,
    pub threshold_public_key: BytesN<32>,
    pub nonce: u64,
    pub timestamp: u64,
}

/// An admin-attested record that a batch of `order_count` orders (identified
/// off-chain by the backend, hashed into `content_hash`) was closed at
/// `timestamp`. This is not a copy of the orders themselves — the backend
/// remains the actual order mempool; this is the on-chain audit trail tying
/// a batch id to what the backend claims it contained.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BatchAttestation {
    pub order_count: u32,
    pub content_hash: BytesN<32>,
    pub timestamp: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum OrderVaultError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    BatchAlreadyExists = 3,
}

#[contract]
pub struct OrderVault;

#[contractimpl]
impl OrderVault {
    /// One-time setup. `admin` is the only address allowed to close a batch
    /// (submit_order itself only requires the submitting user's own auth).
    pub fn initialize(env: Env, admin: Address) -> Result<(), OrderVaultError> {
        if env.storage().instance().has(&ADMIN) {
            return Err(OrderVaultError::AlreadyInitialized);
        }
        env.storage().instance().set(&ADMIN, &admin);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        Ok(())
    }

    /// Submit an encrypted swap order into the pending pool. `encrypted_data`
    /// is opaque to this contract — it can only be decrypted cooperatively by
    /// a threshold of validators (see the backend's validatorService).
    pub fn submit_order(
        env: Env,
        user: Address,
        encrypted_data: Bytes,
        threshold_pubkey: BytesN<32>,
        nonce: u64,
    ) -> u64 {
        user.require_auth();

        let order_id: u64 = env.storage().instance().get(&ORDER_CNT).unwrap_or(0) + 1;

        let order = EncryptedOrder {
            order_id,
            user,
            encrypted_data,
            threshold_public_key: threshold_pubkey,
            nonce,
            timestamp: env.ledger().timestamp(),
        };

        let mut orders: Vec<EncryptedOrder> = env
            .storage()
            .instance()
            .get(&ORDERS)
            .unwrap_or_else(|| Vec::new(&env));
        orders.push_back(order);

        env.storage().instance().set(&ORDERS, &orders);
        env.storage().instance().set(&ORDER_CNT, &order_id);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        order_id
    }

    /// Encrypted orders still waiting to be swept into a batch.
    pub fn get_pending_orders(env: Env) -> Vec<EncryptedOrder> {
        env.storage()
            .instance()
            .get(&ORDERS)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Record that the backend closed a batch of `order_count` orders whose
    /// off-chain contents hash to `content_hash`. `batch_id` is the raw bytes
    /// of the backend's batch UUID. Admin-gated: anyone able to call this
    /// without auth could attest to arbitrary/false batch records.
    pub fn create_batch(
        env: Env,
        batch_id: BytesN<16>,
        order_count: u32,
        content_hash: BytesN<32>,
    ) -> Result<(), OrderVaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN)
            .ok_or(OrderVaultError::NotInitialized)?;
        admin.require_auth();

        let batch_key = (BATCH, batch_id);
        if env.storage().persistent().has(&batch_key) {
            return Err(OrderVaultError::BatchAlreadyExists);
        }

        let attestation = BatchAttestation {
            order_count,
            content_hash,
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&batch_key, &attestation);
        env.storage()
            .persistent()
            .extend_ttl(&batch_key, BATCH_LIFETIME_THRESHOLD, BATCH_BUMP_AMOUNT);

        Ok(())
    }

    /// The attestation recorded for `batch_id`, if any.
    pub fn get_batch(env: Env, batch_id: BytesN<16>) -> Option<BatchAttestation> {
        env.storage().persistent().get(&(BATCH, batch_id))
    }
}

#[cfg(test)]
mod test;
