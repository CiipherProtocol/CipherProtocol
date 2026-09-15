# Cipher Protocol — Backend

Express + TypeScript API. Order intake, batching, and the bridge that calls
the Soroban contracts.

## Setup

```bash
npm install
cp .env.example .env
npm run dev   # http://localhost:5001
```

By default `DATABASE_URL` is unset and the backend falls back to a local
SQLite file (`data/dev.sqlite3`) — zero setup for local dev. Point
`DATABASE_URL` at a real Postgres instance for anything beyond that.

To actually call the deployed testnet contracts (rather than just log a
warning and return stub data), set in `.env`:

```
ORDER_VAULT_CONTRACT=CD6IHURX2DJIKYZLDD24VZTAL347NC6UUW5WYJEF6VJRCAYSULRWTNW4
SETTLEMENT_ENGINE_CONTRACT=CCXVBFI5D34VFKIKEHDOPLTED7UOFXNVJHEUZYAMXTFPNAFRIWRJYYCR
BACKEND_SIGNER_SECRET=<a Stellar secret key that is the contracts' admin>
TOKEN_CONTRACTS=USDC:<contract address>,USDT:<contract address>
```

`BACKEND_SIGNER_SECRET` must belong to whichever identity `initialize`d the
two contracts (see `contracts/README.md`) — every on-chain call the backend
makes (batch attestations, settlement, fee collection) is signed by it.
**Never commit this value** — `.env` is gitignored for exactly this reason.

## Scripts

- `npm run dev` — dev server (`ts-node-dev`, auto-restart)
- `npm run build` / `npm start` — compile to `dist/` and run it
- `npm test` — Jest (no tests written yet — see open issues)

## Structure

`src/routes` → `src/controllers` → `src/services` → `src/db/models`. The
Soroban integration lives in `src/services/sorobanService.ts`; the batching
loop (timer-based, sweeps pending orders) is in
`src/services/batchingService.ts`. See the root
[README](../README.md#status) for which pieces are real versus placeholder.
