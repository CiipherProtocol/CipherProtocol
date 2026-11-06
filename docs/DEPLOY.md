# Deploying the demo

Three ways to run Cipher Protocol, from quickest to most realistic.

| | What runs | Validators | Good for |
|---|---|---|---|
| **A. Render (hosted)** | API + static app | 5, in-process | A public link for reviewers |
| **B. Docker Compose** | API + app + 5 validator containers | 5 separate containers, each with only its own key | The full architecture on one machine |
| **C. Local dev** | `npm run dev` in `backend/` and `frontend/` | in-process, or `npm run validators:dev` | Development |

Anyone can try any of them without a wallet extension: **Try demo wallet**
creates a throwaway testnet key in the browser tab.

## Before you deploy: the sealing key

To seal batches on-chain (recommended), the backend needs
`ORDER_VAULT_CONTRACT` and `BACKEND_SIGNER_SECRET`. That secret must be
the **admin** the contract was `initialize`d with.

> **If the admin key of the existing testnet `order-vault` was ever on the
> machine that was compromised (commit `7913b3a`), don't reuse it.** The
> contract has no way to change its admin. Deploy a fresh `order-vault`
> with a new key instead (it takes about two minutes):
>
> ```bash
> stellar keys generate cipher-demo --network testnet --fund
> cd contracts && cargo build --target wasm32v1-none --release
> stellar contract deploy --wasm target/wasm32v1-none/release/order_vault.wasm \
>   --source cipher-demo --network testnet            # prints the new contract id
> stellar contract invoke --id <NEW_ID> --source cipher-demo --network testnet \
>   -- initialize --admin $(stellar keys address cipher-demo)
> stellar keys show cipher-demo                        # the BACKEND_SIGNER_SECRET
> ```
>
> Then update the contract table in the README.

Without these two values, everything still works, but batches are sealed in
an in-memory dev ledger instead of on-chain. The site's banner always says
which mode is running.

Settlement in the demo is **simulated**. Demo users hold no testnet tokens,
so `settle_batch` would have nothing to move. Orders are still really
encrypted, sealed, threshold-decrypted and validated. Only the token
transfer is skipped, and the UI says so. Set `SETTLEMENT_ENGINE_CONTRACT` and
`TOKEN_CONTRACTS` only for users who hold and approved testnet tokens.

## A. Render

1. Push the repo to GitHub, then go to Render → **New → Blueprint** and
   select it. It reads [`render.yaml`](../render.yaml).
2. When prompted, fill in:
   - `cipher-protocol-api`: `ORDER_VAULT_CONTRACT` and
     `BACKEND_SIGNER_SECRET` (or leave both empty).
   - `cipher-protocol-app`: `VITE_API_URL`, set to the API's URL plus
     `/api`, e.g. `https://cipher-protocol-api.onrender.com/api`. If you
     don't know it yet, deploy, copy it, set it, then **Manual Deploy**
     the app again (Vite bakes it in at build time).
3. Open the app URL. Free instances sleep when idle, so the first request
   can take about 30 seconds, and the banner says so.

The free tier has no persistent disk, so a restart re-runs the DKG (new
group key) and starts with an empty order book. That's fine for a demo.
Add a disk mounted at `/app/data` to keep state across restarts.

**Vercel or Netlify for the frontend instead:** set the project root to
`frontend/`, the build command to `npm run build`, the output to `dist/`,
and `VITE_API_URL` as above. SPA routing is preconfigured (`vercel.json`,
`public/_redirects`).

## B. Docker Compose

```bash
cp backend/.env.example .env   # optional: set ORDER_VAULT_CONTRACT + BACKEND_SIGNER_SECRET
docker compose up --build
# app:  http://localhost:8080
```

`validator-init` generates each validator's identity and API token once.
Each `validator-N` container mounts **only its own** key directory. On first
start the backend runs the DKG over HTTP. Try stopping two validators:

```bash
docker compose stop validator-2 validator-4   # orders still settle (3 of 5)
docker compose stop validator-5               # now they fail cleanly, nothing decrypted
```

With `ORDER_VAULT_CONTRACT` set, every validator checks the batch seal on
Stellar testnet before decrypting. Without it, the validators log that the
check is disabled.

Note that `validator-init` makes this a **single-operator** setup: one
party generates every identity. Independent operators would each generate
their own and exchange only public keys.

## Production notes

- Put validator traffic behind TLS (contributor issue #2).
- Set `AUTH_TOKEN_SECRET` explicitly so sessions survive restarts.
- Use Postgres (`DATABASE_URL`) and persistent volumes for validator keys.
- Rate limits: `RATE_LIMIT_AUTH_PER_MIN` (default 30) and
  `RATE_LIMIT_ORDERS_PER_MIN` (default 20), per client IP, with
  `TRUST_PROXY=1` behind a proxy.
