#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN,
    Env, Symbol, Vec,
};

const DAY_IN_LEDGERS: u32 = 17280;
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - DAY_IN_LEDGERS;

const ADMIN: Symbol = symbol_short!("admin");
const POOL: Symbol = symbol_short!("pool");
const SUPPLY: Symbol = symbol_short!("supply");
const LP_BAL: Symbol = symbol_short!("lp_bal");
const FEES: Symbol = symbol_short!("fees");
const RESULTS: Symbol = symbol_short!("results");

const FEE_BPS: i128 = 30; // 0.3%
const BPS_DENOMINATOR: i128 = 10_000;

#[contracttype]
#[derive(Clone, Debug)]
pub struct DecryptedOrder {
    pub user: Address,
    pub token_in: Address,
    pub token_out: Address,
    pub amount_in: i128,
    pub min_amount_out: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SettlementResult {
    pub user: Address,
    pub token_in: Address,
    pub token_out: Address,
    pub amount_in: i128,
    pub amount_out: i128,
    pub fee: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SettlementError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    BatchAlreadySettled = 3,
    InsufficientOutput = 4,
    EmptyPool = 5,
    InsufficientLiquidity = 6,
}

#[contract]
pub struct SettlementEngine;

#[contractimpl]
impl SettlementEngine {
    pub fn initialize(env: Env, admin: Address) -> Result<(), SettlementError> {
        if env.storage().instance().has(&ADMIN) {
            return Err(SettlementError::AlreadyInitialized);
        }
        env.storage().instance().set(&ADMIN, &admin);
        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
        Ok(())
    }

    /// Canonical pool key: token order doesn't matter to the caller, but it
    /// must map to one storage slot regardless of which order they're passed
    /// in, or add_liquidity(A, B) and a swap quoted against (B, A) would
    /// silently read/write two different "pools" for the same pair.
    fn pool_key(token_a: &Address, token_b: &Address) -> (Address, Address) {
        if token_a < token_b {
            (token_a.clone(), token_b.clone())
        } else {
            (token_b.clone(), token_a.clone())
        }
    }

    fn get_reserves_ordered(env: &Env, token_a: &Address, token_b: &Address) -> (i128, i128) {
        let key = Self::pool_key(token_a, token_b);
        let (reserve_key_a, reserve_key_b): (i128, i128) = env
            .storage()
            .persistent()
            .get(&(POOL, key.clone()))
            .unwrap_or((0, 0));

        if token_a == &key.0 {
            (reserve_key_a, reserve_key_b)
        } else {
            (reserve_key_b, reserve_key_a)
        }
    }

    fn set_reserves_ordered(
        env: &Env,
        token_a: &Address,
        token_b: &Address,
        reserve_a: i128,
        reserve_b: i128,
    ) {
        let key = Self::pool_key(token_a, token_b);
        let ordered = if token_a == &key.0 {
            (reserve_a, reserve_b)
        } else {
            (reserve_b, reserve_a)
        };
        let storage_key = (POOL, key);
        env.storage().persistent().set(&storage_key, &ordered);
        env.storage()
            .persistent()
            .extend_ttl(&storage_key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
    }

    /// Integer square root (Newton's method) — i128 has no built-in sqrt,
    /// and floating point isn't available/deterministic in a contract.
    fn isqrt(value: i128) -> i128 {
        if value < 2 {
            return value.max(0);
        }
        let mut x = value;
        let mut y = (x + 1) / 2;
        while y < x {
            x = y;
            y = (x + value / x) / 2;
        }
        x
    }

    /// Deposit `amount_a`/`amount_b` into the token_a/token_b pool, minting
    /// LP tokens proportional to the deposit (or the geometric mean for the
    /// pool's first deposit).
    pub fn add_liquidity(
        env: Env,
        user: Address,
        token_a: Address,
        token_b: Address,
        amount_a: i128,
        amount_b: i128,
    ) -> i128 {
        user.require_auth();

        let (reserve_a, reserve_b) = Self::get_reserves_ordered(&env, &token_a, &token_b);
        let pool_key = Self::pool_key(&token_a, &token_b);
        let supply_key = (SUPPLY, pool_key.clone());
        let total_supply: i128 = env.storage().persistent().get(&supply_key).unwrap_or(0);

        let lp_tokens = if total_supply == 0 {
            Self::isqrt(amount_a * amount_b)
        } else {
            let tokens_from_a = (amount_a * total_supply) / reserve_a;
            let tokens_from_b = (amount_b * total_supply) / reserve_b;
            tokens_from_a.min(tokens_from_b)
        };

        token::TokenClient::new(&env, &token_a).transfer(&user, &env.current_contract_address(), &amount_a);
        token::TokenClient::new(&env, &token_b).transfer(&user, &env.current_contract_address(), &amount_b);

        Self::set_reserves_ordered(&env, &token_a, &token_b, reserve_a + amount_a, reserve_b + amount_b);

        env.storage()
            .persistent()
            .set(&supply_key, &(total_supply + lp_tokens));
        env.storage()
            .persistent()
            .extend_ttl(&supply_key, LIFETIME_THRESHOLD, BUMP_AMOUNT);

        let lp_balance_key = (LP_BAL, user.clone(), pool_key);
        let prior: i128 = env.storage().persistent().get(&lp_balance_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&lp_balance_key, &(prior + lp_tokens));
        env.storage()
            .persistent()
            .extend_ttl(&lp_balance_key, LIFETIME_THRESHOLD, BUMP_AMOUNT);

        lp_tokens
    }

    /// Burn `lp_tokens` and withdraw the caller's proportional share of both
    /// reserves.
    pub fn remove_liquidity(
        env: Env,
        user: Address,
        token_a: Address,
        token_b: Address,
        lp_tokens: i128,
    ) -> Result<(i128, i128), SettlementError> {
        user.require_auth();

        let pool_key = Self::pool_key(&token_a, &token_b);
        let lp_balance_key = (LP_BAL, user.clone(), pool_key.clone());
        let lp_balance: i128 = env.storage().persistent().get(&lp_balance_key).unwrap_or(0);
        if lp_tokens > lp_balance {
            return Err(SettlementError::InsufficientLiquidity);
        }

        let supply_key = (SUPPLY, pool_key);
        let total_supply: i128 = env.storage().persistent().get(&supply_key).unwrap_or(0);
        if total_supply == 0 {
            return Err(SettlementError::EmptyPool);
        }

        let (reserve_a, reserve_b) = Self::get_reserves_ordered(&env, &token_a, &token_b);
        let amount_a = (lp_tokens * reserve_a) / total_supply;
        let amount_b = (lp_tokens * reserve_b) / total_supply;

        Self::set_reserves_ordered(&env, &token_a, &token_b, reserve_a - amount_a, reserve_b - amount_b);
        env.storage()
            .persistent()
            .set(&supply_key, &(total_supply - lp_tokens));
        env.storage()
            .persistent()
            .set(&lp_balance_key, &(lp_balance - lp_tokens));

        token::TokenClient::new(&env, &token_a).transfer(&env.current_contract_address(), &user, &amount_a);
        token::TokenClient::new(&env, &token_b).transfer(&env.current_contract_address(), &user, &amount_b);

        Ok((amount_a, amount_b))
    }

    pub fn get_reserves(env: Env, token_a: Address, token_b: Address) -> (i128, i128) {
        Self::get_reserves_ordered(&env, &token_a, &token_b)
    }

    /// x*y=k AMM quote for swapping `amount_in` of token_in into token_out,
    /// net of the protocol fee.
    fn quote_swap(env: &Env, order: &DecryptedOrder) -> Result<(i128, i128), SettlementError> {
        let (reserve_in, reserve_out) =
            Self::get_reserves_ordered(env, &order.token_in, &order.token_out);
        if reserve_in == 0 || reserve_out == 0 {
            return Err(SettlementError::EmptyPool);
        }

        let fee = (order.amount_in * FEE_BPS) / BPS_DENOMINATOR;
        let amount_in_after_fee = order.amount_in - fee;
        let amount_out = (amount_in_after_fee * reserve_out) / (reserve_in + amount_in_after_fee);

        if amount_out < order.min_amount_out {
            return Err(SettlementError::InsufficientOutput);
        }

        Ok((amount_out, fee))
    }

    /// Settle a batch of already-decrypted orders atomically: every order
    /// either executes against the pool and the token contracts, or the
    /// whole call reverts (Soroban rolls back all state on any panic/Err
    /// return within a single transaction).
    ///
    /// Requires each order's `user` to have pre-approved this contract to
    /// pull `amount_in` of `token_in` (via that token's `approve`) — the
    /// decrypted order alone isn't a token-movement authorization.
    pub fn settle_batch(
        env: Env,
        batch_id: BytesN<16>,
        decrypted_orders: Vec<DecryptedOrder>,
    ) -> Result<Vec<SettlementResult>, SettlementError> {
        let results_key = (RESULTS, batch_id);
        if env.storage().persistent().has(&results_key) {
            return Err(SettlementError::BatchAlreadySettled);
        }

        let mut results: Vec<SettlementResult> = Vec::new(&env);

        for order in decrypted_orders.iter() {
            let (amount_out, fee) = Self::quote_swap(&env, &order)?;

            let (reserve_in, reserve_out) =
                Self::get_reserves_ordered(&env, &order.token_in, &order.token_out);
            Self::set_reserves_ordered(
                &env,
                &order.token_in,
                &order.token_out,
                reserve_in + order.amount_in,
                reserve_out - amount_out,
            );

            let contract_address = env.current_contract_address();
            token::TokenClient::new(&env, &order.token_in).transfer_from(
                &contract_address,
                &order.user,
                &contract_address,
                &order.amount_in,
            );
            token::TokenClient::new(&env, &order.token_out).transfer(
                &contract_address,
                &order.user,
                &amount_out,
            );

            let fees_key = (FEES, order.token_in.clone());
            let accrued: i128 = env.storage().persistent().get(&fees_key).unwrap_or(0);
            env.storage().persistent().set(&fees_key, &(accrued + fee));
            env.storage()
                .persistent()
                .extend_ttl(&fees_key, LIFETIME_THRESHOLD, BUMP_AMOUNT);

            results.push_back(SettlementResult {
                user: order.user.clone(),
                token_in: order.token_in.clone(),
                token_out: order.token_out.clone(),
                amount_in: order.amount_in,
                amount_out,
                fee,
            });
        }

        env.storage().persistent().set(&results_key, &results);
        env.storage()
            .persistent()
            .extend_ttl(&results_key, LIFETIME_THRESHOLD, BUMP_AMOUNT);

        Ok(results)
    }

    pub fn get_settlement_results(env: Env, batch_id: BytesN<16>) -> Vec<SettlementResult> {
        env.storage()
            .persistent()
            .get(&(RESULTS, batch_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Admin-only: sweep accumulated protocol fees for `token` to `receiver`.
    pub fn collect_fees(env: Env, receiver: Address, token: Address) -> Result<i128, SettlementError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN)
            .ok_or(SettlementError::NotInitialized)?;
        admin.require_auth();

        let fees_key = (FEES, token.clone());
        let accumulated: i128 = env.storage().persistent().get(&fees_key).unwrap_or(0);

        if accumulated > 0 {
            token::TokenClient::new(&env, &token).transfer(
                &env.current_contract_address(),
                &receiver,
                &accumulated,
            );
            env.storage().persistent().set(&fees_key, &0i128);
        }

        Ok(accumulated)
    }
}

#[cfg(test)]
mod test;
