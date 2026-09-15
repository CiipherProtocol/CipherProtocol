# Cipher Protocol

An encrypted-orderflow DEX on Stellar/Soroban. Swap orders are meant to be
encrypted before they leave the user's browser, batched, and settled
atomically — so no single party (not a validator, not the backend, not a
miner-equivalent) can see or front-run an order before it executes.

**Status: early, working proof-of-concept.** The batching → settlement →
AMM pipeline is real and runs end-to-end against deployed Stellar testnet
contracts. The actual encryption is not — see [Status](#status) before you
assume anything here is safe to put real funds behind.

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
User submits a swap
  -> frontend encrypts it (currently a placeholder, see Status)
  -> POST /api/orders (backend stores it, status=pending)
  -> backend batches pending orders on a timer
  -> order-vault.create_batch attests to the batch on-chain (order count + content hash)
  -> validators would cooperatively decrypt the batch (unimplemented, see Status)
  -> settlement-engine.settle_batch executes the swaps atomically against its AMM pool
  -> results stored, orders marked settled
```

## Status

What's real, tested, and running against live Stellar testnet contracts:

- **Contracts** (`contracts/`): `order-vault` and `settlement-engine`,
  12 passing tests, deployed to testnet. `settle_batch` executes a real
  x*y=k AMM swap with fees, verified against on-chain token balances.
- **Backend** (`backend/`): full submit → batch → settle pipeline,
  wired to the real deployed contracts (not stubs) via `@stellar/stellar-sdk`.
- **Frontend** (`frontend/`): wallet connect, swap form, live batch monitor,
  talks to the backend.

What's **not** real yet — the important part for anyone evaluating this:

- **Encryption is a placeholder.** `backend/src/services/encryptionService.ts`
  and `frontend/src/services/encryption.ts` do plain AES/base64, not
  threshold encryption. Anyone who can see the ciphertext and knows the
  scheme can decrypt it alone — this defeats the entire MEV-resistance
  premise until real threshold ECIES (or similar) is implemented.
- **Auth is a placeholder.** `backend/src/middleware/auth.ts` trusts an
  `x-user-address` header with no signature verification — the backend
  cannot currently tell if a request is really from the address it claims.
- **Threshold decryption is unimplemented.** `backend/src/services/validatorService.ts`
  has no real validator coordination; there is no validator set.
- **The on-chain vault is an attestation, not a ledger of orders.**
  `order-vault.create_batch` records an admin-signed hash + count for a
  batch; the backend's database is still the actual order mempool. Real
  on-chain order submission (users signing `submit_order` directly) is a
  separate, unbuilt path.
- No automated test suite for the backend or frontend yet (contracts have
  one — see `contracts/*/src/test.rs`).

None of this is hidden in the code — every placeholder above has a comment
at its definition explaining what it fakes and why.

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
