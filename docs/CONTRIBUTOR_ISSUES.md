# Contributor issues

Point values follow Drips Wave's complexity bands (100/150/200). Each
section is a ready-to-post issue body. See the commands at the bottom.

**Already done:** threshold encryption, validator share coordination,
distributed key generation (Joint-Feldman with complaints), validators as
separate processes with signed DKG messages, signature auth,
backend and frontend test suites, and CI. See the root README's Status
section.

---

### 1. Unbiased DKG: Pedersen commitments in round 1 (150)

`backend/src/crypto/dkg.ts` implements Joint-Feldman DKG with complaints.
A dealer that waits to see the others' Feldman commitments can bias the
distribution of the group key (it still can't learn the secret). Upgrade
round 1 to GJKR: deal with Pedersen commitments `a·G + b·H` (with `H` from
`Point.hashToCurve`), and only publish Feldman commitments for `QUAL`
afterwards.

**Scope:** `DkgParticipant` round 1 and the extraction round, plus tests.
All existing `dkg.test.ts` cases must still pass.
**Read first:** the "Key generation (DKG)" section of
[docs/THRESHOLD_ENCRYPTION.md](THRESHOLD_ENCRYPTION.md).

---

### 2. Validator deployment: Docker Compose + TLS (150)

Validators already run as separate processes (`npm run validators:dev`),
but only on one host over plain HTTP. Add a Docker Compose setup (one
container and one volume per validator, plus the backend), and put the
coordinator-to-validator transport behind TLS. Mutual TLS is a bonus.

**Acceptance:** `docker compose up` brings up 5 validators and the backend.
The DKG completes, and an order settles. Stopping 2 validator containers
doesn't stop settlement.

---

### 3. Commit ciphertext hashes on-chain; validators verify before decrypting (200)

`order-vault.create_batch` attests to a hash of order *IDs*. Make it commit
to the hash of the ordered list of *ciphertexts*, so the batch contents and
order are provably fixed before any validator releases a share. Then have
each validator (`src/validator/localValidator.ts#requestDecryptionShares`)
check that commitment on-chain itself before contributing. This is the
remaining place where validators trust the coordinator.

**Scope:** contract change and tests in `contracts/order-vault`, plus the
`sorobanService.createBatch` update.

---

### 4. Real database migrations (100)

`backend/src/index.ts` uses `sequelize.sync({ alter: true })`. Replace it
with real migrations (`umzug` or `sequelize-cli`), with an initial migration
matching `db/models/`, and run them in the backend tests.

---

### 5. Rate limiting and request-size hardening (100)

`/api/auth/challenge` and `/api/orders` have no rate limits. Add per-IP
limits for challenges and per-address limits for orders, with tests.

---

### 6. Real token registry and price state (100)

`frontend/src/constants/tokens.ts` is hardcoded, and
`context/PriceContext.tsx` uses mock prices. Use the deployed testnet tokens
(see `contracts/README.md`) and show a clearly labelled "no price feed yet"
state instead of fake numbers.

---

### 7. Configurable protocol fee (100)

`settlement-engine`'s `FEE_BPS: i128 = 30` is a constant. Add an
admin-gated `set_fee_bps` (bounded, for example ≤ 100 bps), with a test
proving a non-admin call is rejected.

---

### 8. Show the user's own sealed order details (100)

Until settlement, the order history shows "🔒 sealed" because the server
can't see the details, which is by design. Keep a local, per-browser copy
of the plaintext the user submitted, keyed by order ID, so their own
pending orders show tokens and amounts. Nothing new is sent to the server.

---

## Posting these

```bash
for l in "points:100" "points:150" "points:200"; do
  gh label create "$l" --repo CiipherProtocol/CipherProtocol --color BFD4F2
done
gh label create "help wanted" --repo CiipherProtocol/CipherProtocol --color 008672

gh issue create --repo CiipherProtocol/CipherProtocol \
  --title "Unbiased DKG: Pedersen commitments in round 1" \
  --label "help wanted,points:150" --body-file issue-1.md
# …repeat per issue with its points label
```
