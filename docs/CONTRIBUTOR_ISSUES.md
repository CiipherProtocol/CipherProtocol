# Draft contributor issues

Point values follow Drips Wave's rough complexity bands (100/150/200).
These are drafts — edit before posting, then either paste each into GitHub
by hand or run the `gh issue create` commands at the bottom once the repo
exists.

---

### 1. Implement real threshold encryption (200)

`backend/src/services/encryptionService.ts` and
`frontend/src/services/encryption.ts` are placeholders (AES with a
SHA-256-derived key / plain base64) — anyone who sees the ciphertext and
knows the scheme can decrypt it alone. Replace with a real threshold
scheme (e.g. threshold ECIES, or a Shamir-secret-shared symmetric key) such
that no single validator can decrypt an order alone.

**Scope:** pick/justify a scheme, implement encrypt (frontend) and
threshold-decrypt (backend/validator-side), update `useEncryption.ts` and
`encryptionService.ts` accordingly, keep the wire format documented.
**Out of scope:** standing up a real multi-party validator network (see
issue #3).

---

### 2. Replace placeholder auth with signature verification (150)

`backend/src/middleware/auth.ts` currently trusts an `x-user-address`
header — no proof the request is actually from that address. Replace with
challenge-response: client requests a nonce, signs it with Freighter
(`signMessage` / `signAuthEntry`), backend verifies the signature against
the claimed address before trusting `req.user`.

**Scope:** a `/api/auth/challenge` endpoint, signature verification
middleware, frontend wiring in `useWallet`/`api.ts`. **Acceptance:** a
request with a stolen/guessed address and no valid signature is rejected.

---

### 3. Validator threshold-decryption coordination (200)

`backend/src/services/validatorService.ts#coordinateDecryption` returns
`null` — there's no real validator set or share-combination logic.
Implement validator registration, a way to distribute decryption requests
to registered validators, and combine returned shares into a decrypted
order. Depends on issue #1's scheme being decided first.

**Scope:** validator registration flow (already has a DB model —
`db/models/Validator.ts`), an API/protocol for requesting + collecting
shares, share-combination logic. A single-process "simulated validators"
version is an acceptable first PR; a real distributed version can follow.

---

### 4. Backend automated test suite (150)

`backend/` has zero automated tests (`npm test` runs Jest against nothing).
Add tests for `orderController`, `batchController`, `settlementController`,
and the routes' auth/validation middleware, using Jest + supertest against
an in-memory SQLite DB.

**Acceptance:** `npm test` in `backend/` runs and covers at least the
submit → batch → settle happy path plus the auth-rejection and
double-settlement-rejection cases.

---

### 5. Frontend automated test suite (150)

`frontend/` has no tests either. Add Vitest + React Testing Library
coverage for `SwapForm`, the `useSwap`/`useBatches` hooks (mocked API), and
`utils/validation.ts`/`utils/numbers.ts`.

**Acceptance:** `npm test` exists and runs in CI-friendly (non-watch) mode.

---

### 6. On-chain direct order submission (200)

Right now `order-vault.submit_order` (which requires the user's own
signature) is never called — the backend's Postgres DB is the real order
mempool, and `create_batch` only records an attestation (see root
README's Status section for why). This issue is to design and build the
alternative: the frontend calls `submit_order` directly via Freighter,
and the backend indexes from chain instead of (or alongside) its own DB.

**Scope:** this is a genuine design task, not just wiring — start by
proposing the approach in the issue thread before implementing, since it
changes how batching/backend trust works. Expect discussion before a PR is
accepted.

---

### 7. Real database migrations (100)

`backend/src/index.ts` uses `sequelize.sync()` for schema setup — fine for
a prototype, not for a real deployment (no rollback, no history). Replace
with real migrations (`umzug` or `sequelize-cli`), with an initial
migration matching the current model definitions in `db/models/`.

---

### 8. CI pipeline (100)

No CI exists yet. Add GitHub Actions workflows: `cargo test` for
`contracts/`, `npx tsc --noEmit` + build for `frontend/` and `backend/`, on
every PR.

---

### 9. Real token registry (100)

`frontend/src/constants/tokens.ts` has hardcoded token symbols/addresses
and `context/PriceContext.tsx` has hardcoded mock prices. Replace with
something that reflects real deployed tokens (start with the testnet
tokens listed in `contracts/README.md`) and either a real price feed or a
clearly-labeled "no price feed yet" state instead of fake numbers.

---

### 10. Configurable protocol fee (100)

`settlement-engine`'s swap fee is a hardcoded constant
(`FEE_BPS: i128 = 30`). Make it admin-settable via a new contract method
(`set_fee_bps`, admin-gated like `collect_fees`), with a test proving a
non-admin call is rejected.

---

## Once the repo exists, create these with:

```bash
gh issue create --repo CiipherProtocol/CipherProtocol \
  --title "Implement real threshold encryption" \
  --label "help wanted,points:200" \
  --body-file - <<'EOF'
[paste the section 1 body above]
EOF
```

Repeat per issue, adjusting `--label points:N` to match. Labels
`points:100` / `points:150` / `points:200` need to exist in the repo first:

```bash
gh label create "points:100" --repo CiipherProtocol/CipherProtocol --color BFD4F2
gh label create "points:150" --repo CiipherProtocol/CipherProtocol --color BFD4F2
gh label create "points:200" --repo CiipherProtocol/CipherProtocol --color BFD4F2
gh label create "help wanted" --repo CiipherProtocol/CipherProtocol --color 008672
```
