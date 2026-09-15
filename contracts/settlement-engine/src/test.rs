use crate::{DecryptedOrder, SettlementEngine, SettlementEngineClient, SettlementError};
use soroban_sdk::{testutils::Address as _, token, vec, Address, BytesN, Env};

fn batch_id(env: &Env, byte: u8) -> BytesN<16> {
    BytesN::from_array(env, &[byte; 16])
}

struct TestToken<'a> {
    address: Address,
    client: token::TokenClient<'a>,
    admin_client: token::StellarAssetClient<'a>,
}

fn create_token<'a>(env: &Env, admin: &Address) -> TestToken<'a> {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let address = sac.address();
    TestToken {
        address: address.clone(),
        client: token::TokenClient::new(env, &address),
        admin_client: token::StellarAssetClient::new(env, &address),
    }
}

fn setup() -> (Env, SettlementEngineClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SettlementEngine, ());
    let client = SettlementEngineClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    (env, client, admin)
}

#[test]
fn add_liquidity_first_deposit_mints_geometric_mean() {
    let (env, client, token_admin) = setup();
    let user = Address::generate(&env);

    let token_a = create_token(&env, &token_admin);
    let token_b = create_token(&env, &token_admin);
    token_a.admin_client.mint(&user, &1_000_000);
    token_b.admin_client.mint(&user, &1_000_000);

    let lp = client.add_liquidity(&user, &token_a.address, &token_b.address, &10_000, &40_000);

    // isqrt(10_000 * 40_000) = isqrt(400_000_000) = 20_000
    assert_eq!(lp, 20_000);
    assert_eq!(
        client.get_reserves(&token_a.address, &token_b.address),
        (10_000, 40_000)
    );
    assert_eq!(token_a.client.balance(&user), 1_000_000 - 10_000);
    assert_eq!(token_a.client.balance(&client.address), 10_000);
}

#[test]
fn get_reserves_is_symmetric_regardless_of_token_order() {
    let (env, client, token_admin) = setup();
    let user = Address::generate(&env);

    let token_a = create_token(&env, &token_admin);
    let token_b = create_token(&env, &token_admin);
    token_a.admin_client.mint(&user, &1_000_000);
    token_b.admin_client.mint(&user, &1_000_000);

    client.add_liquidity(&user, &token_a.address, &token_b.address, &10_000, &40_000);

    // Same pool queried with arguments swapped must report reserves swapped
    // too, not a distinct (empty) pool — this is the pool_key canonicalization fix.
    assert_eq!(
        client.get_reserves(&token_b.address, &token_a.address),
        (40_000, 10_000)
    );
}

#[test]
fn add_then_remove_liquidity_round_trips() {
    let (env, client, token_admin) = setup();
    let user = Address::generate(&env);

    let token_a = create_token(&env, &token_admin);
    let token_b = create_token(&env, &token_admin);
    token_a.admin_client.mint(&user, &1_000_000);
    token_b.admin_client.mint(&user, &1_000_000);

    let lp = client.add_liquidity(&user, &token_a.address, &token_b.address, &10_000, &40_000);
    let (amount_a, amount_b) = client.remove_liquidity(&user, &token_a.address, &token_b.address, &lp);

    assert_eq!((amount_a, amount_b), (10_000, 40_000));
    assert_eq!(client.get_reserves(&token_a.address, &token_b.address), (0, 0));
    assert_eq!(token_a.client.balance(&user), 1_000_000);
    assert_eq!(token_b.client.balance(&user), 1_000_000);
}

#[test]
fn settle_batch_executes_swap_against_pool() {
    let (env, client, token_admin) = setup();
    let lp_provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let token_in = create_token(&env, &token_admin);
    let token_out = create_token(&env, &token_admin);
    token_in.admin_client.mint(&lp_provider, &1_000_000);
    token_out.admin_client.mint(&lp_provider, &1_000_000);
    token_in.admin_client.mint(&trader, &10_000);
    token_in
        .client
        .approve(&trader, &client.address, &1_000, &(env.ledger().sequence() + 1000));

    client.add_liquidity(&lp_provider, &token_in.address, &token_out.address, &100_000, &100_000);

    let order = DecryptedOrder {
        user: trader.clone(),
        token_in: token_in.address.clone(),
        token_out: token_out.address.clone(),
        amount_in: 1_000,
        min_amount_out: 1,
    };

    let results = client.settle_batch(&batch_id(&env, 1), &vec![&env, order]);
    assert_eq!(results.len(), 1);

    let result = results.get(0).unwrap();
    assert_eq!(result.user, trader);
    assert!(result.amount_out > 0);
    assert!(result.fee > 0);

    assert_eq!(token_out.client.balance(&trader), result.amount_out);
    assert_eq!(token_in.client.balance(&trader), 10_000 - 1_000);
    assert_eq!(client.get_settlement_results(&batch_id(&env, 1)).len(), 1);
}

#[test]
fn settle_batch_rejects_output_below_minimum() {
    let (env, client, token_admin) = setup();
    let lp_provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let token_in = create_token(&env, &token_admin);
    let token_out = create_token(&env, &token_admin);
    token_in.admin_client.mint(&lp_provider, &1_000_000);
    token_out.admin_client.mint(&lp_provider, &1_000_000);
    token_in.admin_client.mint(&trader, &10_000);

    client.add_liquidity(&lp_provider, &token_in.address, &token_out.address, &100_000, &100_000);

    let order = DecryptedOrder {
        user: trader.clone(),
        token_in: token_in.address.clone(),
        token_out: token_out.address.clone(),
        amount_in: 1_000,
        min_amount_out: 999_999, // unreachable
    };

    let result = client.try_settle_batch(&batch_id(&env, 1), &vec![&env, order]);
    assert_eq!(result, Err(Ok(SettlementError::InsufficientOutput)));
}

#[test]
fn settle_batch_cannot_run_twice_for_same_batch_id() {
    let (env, client, token_admin) = setup();
    let lp_provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let token_in = create_token(&env, &token_admin);
    let token_out = create_token(&env, &token_admin);
    token_in.admin_client.mint(&lp_provider, &1_000_000);
    token_out.admin_client.mint(&lp_provider, &1_000_000);
    token_in.admin_client.mint(&trader, &10_000);
    token_in
        .client
        .approve(&trader, &client.address, &2_000, &(env.ledger().sequence() + 1000));

    client.add_liquidity(&lp_provider, &token_in.address, &token_out.address, &100_000, &100_000);

    let order = DecryptedOrder {
        user: trader.clone(),
        token_in: token_in.address.clone(),
        token_out: token_out.address.clone(),
        amount_in: 1_000,
        min_amount_out: 1,
    };

    client.settle_batch(&batch_id(&env, 1), &vec![&env, order.clone()]);
    let result = client.try_settle_batch(&batch_id(&env, 1), &vec![&env, order]);
    assert_eq!(result, Err(Ok(SettlementError::BatchAlreadySettled)));
}

#[test]
fn collect_fees_requires_admin_auth() {
    let env = Env::default();
    let contract_id = env.register(SettlementEngine, ());
    let client = SettlementEngineClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let token_admin = Address::generate(&env);
    let receiver = Address::generate(&env);
    let token = create_token(&env, &token_admin);

    // No mock_all_auths(): proves collect_fees' admin.require_auth() is load-bearing.
    let result = client.try_collect_fees(&receiver, &token.address);
    assert!(result.is_err());
}
