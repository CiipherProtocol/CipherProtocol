# Contributor issues

Point values follow Drips Wave's complexity bands (100/150/200). Each
section is a ready-to-post issue body. See the commands at the bottom.

**Already done:** threshold encryption, validator share coordination,
distributed key generation (Joint-Feldman with complaints), validators as
separate processes with signed DKG messages, on-chain batch sealing
verified by every validator, signature auth,
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

### 2. TLS between coordinator and validators (150)

`docker-compose.yml` runs each validator in its own container, but
coordinator↔validator traffic is plain HTTP with bearer tokens on the
Docker network. Add TLS. Mutual TLS, with each validator pinning the
coordinator's certificate, is a bonus. Document how an independent
operator would generate and exchange certs.

**Acceptance:** the compose stack runs over TLS, and a validator rejects
plaintext connections.

---

### 3. Validators enforce a batch policy before decrypting (150)

Validators already refuse to decrypt anything not sealed on-chain
(`src/chain/batchCommitment.ts#assertBatchSealed`). But the coordinator
still chooses what goes into a batch, and it could seal a batch of one to
single out an order. Add a validator-side policy, checked against the
on-chain record: a minimum order count *or* a minimum age since the last
sealed batch. Make it configurable per validator.

**Acceptance:** tests show a 1-order batch is refused while the policy is
unmet and accepted once the age threshold passes, with no change to the
honest pipeline.

---

### 3b. Bind settlement to the on-chain seal (150)

`settlement-engine.settle_batch` doesn't check `order-vault`. Make it read
`order-vault.get_batch(batch_id)` (cross-contract call) and reject settling
a batch that wasn't sealed, or whose order count doesn't match. Add contract
tests for both rejections and for the happy path.

---

### 4. Real database migrations (100)

`backend/src/index.ts` uses `sequelize.sync({ alter: true })`. Replace it
with real migrations (`umzug` or `sequelize-cli`), with an initial migration
matching `db/models/`, and run them in the backend tests.

---

### 5. Shared rate-limit store (100)

`backend/src/middleware/rateLimit.ts` keeps counters in process memory,
which is fine for one instance. Add an optional Redis-backed store (enabled
by `REDIS_URL`) so limits hold across replicas, with tests for both.

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
