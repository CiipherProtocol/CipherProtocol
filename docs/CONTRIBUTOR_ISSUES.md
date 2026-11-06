# Contributor issues

Point values follow Drips Wave's complexity bands (100/150/200). Each
section is a ready-to-post issue body. See the commands at the bottom.

**Already done** (were issues #1–#5 and #8 in the first draft): threshold
encryption, validator share coordination (simulated set), signature auth,
backend and frontend test suites, and CI. See the root README's Status
section.

---

### 1. Distributed key generation for the validator set (200)

`backend/src/crypto/threshold.ts#generateKeySet` is a trusted dealer, so
whoever runs keygen learns the group secret `y`. Replace it with a
Pedersen/Feldman DKG so `y` never exists in one place. Every validator
should end up with only its own share `y_i`, plus public `Y` and
`Y_i = y_i·G` for all `i`.

**Scope:** DKG rounds (commitments, share distribution, complaint and
verification), run across the in-process `SimulatedValidator`s, plus tests
showing (a) the result decrypts through the existing `combineShares` path
and (b) a dealer that sends an inconsistent share is detected.
**Read first:** [docs/THRESHOLD_ENCRYPTION.md](THRESHOLD_ENCRYPTION.md).

---

### 2. Remote validator nodes (200)

All validators are `SimulatedValidator` instances inside the backend
process. Build a standalone validator service (one share per process) and a
`RemoteValidator` client implementing the existing `ValidatorNode`
interface in `backend/src/services/validatorNetwork.ts`.

**Acceptance:** the pipeline tests pass against 5 validator processes, and
the same tests pass with 2 of them killed. The validator only releases
shares for a batch whose `order-vault` attestation exists on-chain.

---

### 3. Commit ciphertext hashes on-chain before decryption (150)

`order-vault.create_batch` attests to a hash of order *IDs*. Make it commit
to the hash of the ordered list of *ciphertexts*, so the batch contents and
order are provably fixed before any validator releases a share. Then have
`validatorService.coordinateDecryption` (and later issue #2's remote
validators) check it.

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
  --title "Distributed key generation for the validator set" \
  --label "help wanted,points:200" --body-file issue-1.md
# …repeat per issue with its points label
```
