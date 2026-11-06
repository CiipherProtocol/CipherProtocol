<p align="center">
  <img src="docs/assets/logo.png" alt="Cipher Protocol" width="120">
</p>

# Cipher Protocol

An encrypted-orderflow DEX on Stellar/Soroban. Swap orders are meant to be
encrypted before they leave the user's browser, batched, and settled
atomically — so no single party (not a validator, not the backend, not a
miner-equivalent) can see or front-run an order before it executes.

**Status: working proof-of-concept on Stellar testnet.** Orders are
encrypted in the browser with real t-of-n threshold encryption and are only
decrypted, with verifiable validator shares, after their batch is sealed.
Validators generate the key together and can run as separate processes.
See [Status](#status) before trusting this with real funds.

[![CI](https://github.com/CiipherProtocol/CipherProtocol/actions/workflows/ci.yml/badge.svg)](https://github.com/CiipherProtocol/CipherProtocol/actions/workflows/ci.yml)

## Architecture

```
frontend/    React + TypeScript + Vite. Wallet connect (Freighter), swap
             form, batch monitor, order history.
backend/     Express + TypeScript API. Order intake, batching, and the
             bridge that calls the Soroban contracts.
contracts/   Soroban smart contracts (Rust): order-vault (batch
             attestation) and settlement-engine (AMM + atomic settlement).
```

Each has its own README with setup/run instructions:
[frontend](frontend/README.md) · [backend](backend/README.md) ·
[contracts](contracts/README.md)

### Data flow

```
User signs in: Freighter signs a never-submittable challenge tx -> session token
User submits a swap
  -> browser encrypts it to the validator group key
     (ElGamal KEM on ristretto255 + AES-256-GCM, bound to the user's address)
  -> POST /api/orders carries ciphertext only; the backend stores it with no plaintext
  -> batching loop seals pending orders into a batch
  -> order-vault.create_batch attests to the batch on-chain
  -> validators each return y_i*R plus a DLEQ proof; bad shares are discarded
  -> any t valid shares combine to decrypt; each payload is validated
  -> settlement-engine.settle_batch executes the swaps atomically against its AMM pool
  -> orders revealed and marked settled (or failed, with a reason)
```

Full cryptographic design, threat model, and remaining gaps:
[docs/THRESHOLD_ENCRYPTION.md](docs/THRESHOLD_ENCRYPTION.md).

## Status

What's real and tested:

- **Threshold encryption** (`backend/src/crypto/`): t-of-n ElGamal KEM over
  ristretto255 with AES-256-GCM, Shamir-shared keys, Chaum–Pedersen DLEQ
  proofs on every decryption share, and Lagrange combination. The browser
  runs a byte-identical copy of the encryption code, and a test enforces it.
- **Validator coordination** (`backend/src/services/validatorService.ts`):
  shares are collected per sealed batch, proofs are verified against
  registered keys, and up to `n − t` byzantine validators are tolerated.
  A bad order fails on its own without blocking the batch.
- **Wallet-signature auth** (`backend/src/services/authService.ts`): a
  SEP-10-style challenge, signed in Freighter and verified as ed25519
  against the claimed account. No more trusting a header.
- **Contracts** (`contracts/`): `order-vault` and `settlement-engine`,
  deployed to testnet. `settle_batch` executes a real x*y=k AMM swap with
  fees, verified against on-chain token balances.
- **Distributed key generation** (`backend/src/crypto/dkg.ts`): validators
  jointly generate the threshold key (Joint-Feldman with complaints), so no
  dealer ever knows the group secret. Shares travel encrypted to their
  recipient, and dealers who cheat are disqualified.
- **Validators as separate processes** (`backend/src/validator/`): each
  holds one share and an identity key, behind an authenticated HTTP API.
  The coordinator is treated as hostile: every DKG message is signed, and
  share-harvesting tricks abort the DKG instead of leaking. Run
  `npm run validators:dev` for a 5-process cluster.
- **Tests and CI**: 55 backend tests (crypto, DKG, malicious coordinator,
  remote validators, end-to-end pipeline, auth),
  8 frontend tests, and the contract suites. They run on every PR, together
  with a source-integrity check that blocks hidden or obfuscated code.

What's **not** real yet:

- **Validators trust the coordinator about *when* to decrypt.** They
  authenticate it, but they don't yet check on-chain that a batch is sealed
  before releasing shares. Next step: commit ciphertext hashes on-chain and
  have validators verify them.
- **No independent operators yet.** Validators can run on separate
  machines, but today they're run by one party (in-process by default, or
  `validators:dev` on one host). See
  [the design doc](docs/THRESHOLD_ENCRYPTION.md#what-is-still-trusted-and-whats-next).
- **The on-chain vault is an attestation, not a ledger of orders.**
  `order-vault.create_batch` records an admin-signed hash and count. The
  backend database is still the mempool, and it doesn't yet commit to
  ciphertext hashes on-chain.
- **Schema setup uses `sequelize.sync`** rather than real migrations.

## Deployed contracts (Stellar testnet)

| Contract | Address |
|---|---|
| order-vault | `CD6IHURX2DJIKYZLDD24VZTAL347NC6UUW5WYJEF6VJRCAYSULRWTNW4` |
| settlement-engine | `CCXVBFI5D34VFKIKEHDOPLTED7UOFXNVJHEUZYAMXTFPNAFRIWRJYYCR` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and
[open issues](../../issues) for what's up for grabs — the gaps listed above
are exactly where help is most needed.

## License

[MIT](LICENSE)
