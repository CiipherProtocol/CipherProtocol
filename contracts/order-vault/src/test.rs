use crate::{OrderVault, OrderVaultClient};
use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env};

fn setup() -> (Env, OrderVaultClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(OrderVault, ());
    let client = OrderVaultClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    (env, client, admin)
}

fn batch_id(env: &Env, byte: u8) -> BytesN<16> {
    BytesN::from_array(env, &[byte; 16])
}

#[test]
fn submit_order_assigns_incrementing_ids() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    let encrypted_data = Bytes::from_array(&env, &[1, 2, 3, 4]);
    let pubkey = BytesN::from_array(&env, &[0u8; 32]);

    let first = client.submit_order(&user, &encrypted_data, &pubkey, &0);
    let second = client.submit_order(&user, &encrypted_data, &pubkey, &1);

    assert_eq!(first, 1);
    assert_eq!(second, 2);
    assert_eq!(client.get_pending_orders().len(), 2);
}

#[test]
fn create_batch_stores_admin_attested_record() {
    let (env, client, _admin) = setup();
    let id = batch_id(&env, 1);
    let content_hash = BytesN::from_array(&env, &[7u8; 32]);

    client.create_batch(&id, &3, &content_hash);

    let attestation = client.get_batch(&id).unwrap();
    assert_eq!(attestation.order_count, 3);
    assert_eq!(attestation.content_hash, content_hash);
}

#[test]
fn get_batch_is_none_for_unknown_id() {
    let (env, client, _admin) = setup();
    assert_eq!(client.get_batch(&batch_id(&env, 99)), None);
}

#[test]
fn create_batch_requires_admin_auth() {
    // No mock_all_auths() here — initialize() itself needs no auth, and
    // leaving auth unmocked proves create_batch's require_auth() is load-bearing.
    let env = Env::default();
    let contract_id = env.register(OrderVault, ());
    let client = OrderVaultClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let content_hash = BytesN::from_array(&env, &[1u8; 32]);
    let result = client.try_create_batch(&batch_id(&env, 1), &1, &content_hash);
    assert!(result.is_err());
}

#[test]
fn cannot_recreate_same_batch_id() {
    let (env, client, _admin) = setup();
    let id = batch_id(&env, 1);
    let content_hash = BytesN::from_array(&env, &[1u8; 32]);

    client.create_batch(&id, &1, &content_hash);
    let result = client.try_create_batch(&id, &1, &content_hash);
    assert!(result.is_err());
}
