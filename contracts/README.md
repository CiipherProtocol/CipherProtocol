# Cipher Protocol — Contracts

Soroban smart contracts (Rust workspace): `order-vault` and
`settlement-engine`.

## Setup

Requires Rust with the `wasm32v1-none` target and the
[`stellar` CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli):

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli
```

## Test

```bash
cargo test
```

12 tests across both contracts, run against the real `soroban-env-host`
execution engine (not mocked) — including AMM math, pool-key
canonicalization, atomic settlement, double-settlement rejection, and
admin-auth checks.

## Build

```bash
cargo build --target wasm32v1-none --release
# artifacts: target/wasm32v1-none/release/order_vault.wasm
#            target/wasm32v1-none/release/settlement_engine.wasm
```

Note: as of Rust 1.82+, Soroban contracts must target `wasm32v1-none`, not
`wasm32-unknown-unknown` (the latter now enables wasm features Soroban's
environment doesn't support).

## Deploy

```bash
stellar keys generate <your-identity> --network testnet --fund

stellar contract deploy \
  --wasm target/wasm32v1-none/release/order_vault.wasm \
  --source <your-identity> --network testnet

stellar contract deploy \
  --wasm target/wasm32v1-none/release/settlement_engine.wasm \
  --source <your-identity> --network testnet

# Then initialize both with an admin address — required before create_batch,
# collect_fees, etc. will accept calls:
stellar contract invoke --id <order-vault-id> --source <your-identity> \
  --network testnet -- initialize --admin <admin-address>
stellar contract invoke --id <settlement-engine-id> --source <your-identity> \
  --network testnet -- initialize --admin <admin-address>
```

Currently deployed testnet instances are listed in the root
[README](../README.md#deployed-contracts-stellar-testnet).

## Design notes

- `order-vault.create_batch` records an **admin-attested** batch (order
  count + content hash), not a copy of the orders themselves — see the root
  README's Status section for why. `submit_order`/`get_pending_orders` exist
  for a possible future direct-submission path but aren't wired to anything
  yet.
- `settlement-engine` combines settlement, the AMM liquidity pool, and fee
  collection in **one** contract deliberately — Soroban contracts don't
  share storage across contract IDs, so splitting these (as some early
  drafts of this design did) would mean `settle_batch` couldn't see
  `add_liquidity`'s reserves.
- Pool keys are canonicalized (sorted token pair) so `(A, B)` and `(B, A)`
  resolve to the same pool.
- `settle_batch` requires each order's `user` to have pre-approved the
  contract to pull `amount_in` of `token_in` (SEP-41 `approve`) — the
  decrypted order alone isn't a token-movement authorization.
