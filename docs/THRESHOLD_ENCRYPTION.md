# Threshold order encryption

How Cipher Protocol keeps a swap order secret until the batch it belongs to
is sealed, and what is still trusted.

## Goal

Nobody can read an order early enough to front-run it. That includes the
backend, any single validator, and anyone watching the network. An order
becomes readable only when **t of n** validators cooperate, and they only
cooperate after the batch's contents and order are fixed.

## Scheme

Threshold ElGamal key encapsulation over the
[ristretto255](https://ristretto.group) prime-order group, with
HKDF-SHA256 and AES-256-GCM. The code is in
[`backend/src/crypto/`](../backend/src/crypto). The cipher half
(`orderCipher.ts`) is shipped byte-identically to the frontend, and a test
enforces that.

**Setup (t-of-n), by distributed key generation.** The validators jointly
generate a group secret `y` that **no party ever holds**: not a validator,
not the coordinator, not the operator. Validator `i` ends up with only a
Shamir share `y_i`. Everyone knows the group key `Y = y·G` and each
validator's verification key `Y_i = y_i·G`. See [Key generation](#key-generation-dkg).

**Encrypt (browser).** For an order `m` from user address `addr`:

```
r ← random scalar
R = r·G
K = r·Y
k = HKDF-SHA256(ikm = R‖K, salt = "cipher-protocol", info = "cipher-protocol/order-cipher/v1")
c = AES-256-GCM_k(nonce, m, aad = R‖addr)
wire = "ctp1." ‖ base64url(R ‖ nonce ‖ c)
```

**Partial decrypt (each validator).** `D_i = y_i·R`, plus a Chaum–Pedersen
DLEQ proof that `log_G(Y_i) = log_R(D_i)`. In other words, the validator
proves it used its real share without revealing it.

**Combine (coordinator).** Verify each proof against the *registered* `Y_i`
and drop failures. Take any `t` valid shares and compute
`K = Σ λ_i·D_i = y·R`, where `λ_i` are Lagrange coefficients at 0. Then
derive `k` and open the ciphertext.

## Properties, and the tests that check them

| Property | Why | Test |
|---|---|---|
| Any t shares decrypt; t−1 learn nothing | Shamir sharing + ElGamal | `threshold.test.ts` |
| A lying validator is detected, not trusted | DLEQ proof per share | `threshold.test.ts`, `pipeline.test.ts` ("byzantine") |
| Up to n−t faulty validators tolerated | Only t valid shares needed | `pipeline.test.ts` |
| A ciphertext can't be resubmitted under another account | User address is GCM AAD; the decrypted `user` must match the submitter | `pipeline.test.ts` ("replayed", "different user") |
| Tampering is detected | AES-GCM authentication | `threshold.test.ts` |
| The backend stores no plaintext before settlement | The client sends only `{encrypted_data, threshold_pubkey, nonce}` | `pipeline.test.ts`, `SwapForm.test.tsx` |
| Contents and order are fixed on-chain before anything is decrypted | Each validator checks the `order-vault` commitment itself before releasing a share (see [Batch sealing](#batch-sealing-on-chain)) | `batchCommitment.test.ts`, `remoteValidators.test.ts` |
| A pending order can't be decrypted early, even by a coordinator holding every validator token | No sealed batch on-chain means no shares | `batchCommitment.test.ts`, `remoteValidators.test.ts` ("never sealed") |

## Key generation (DKG)

Joint-Feldman DKG with a complaint round (Pedersen '91; Gennaro, Jarecki,
Krawczyk and Rabin '99), in [`dkg.ts`](../backend/src/crypto/dkg.ts):

1. **Deal.** Each validator `i` picks a random polynomial `f_i` of degree
   `t−1` and broadcasts Feldman commitments `C_{i,k} = a_{i,k}·G`. It sends
   `s_{i→j} = f_i(j)` to each `j`, **encrypted to `j`'s transport key** with
   the same ElGamal + AES-GCM cipher used for orders. The AAD binds each
   share to the session, dealer and recipient. The coordinator routing these
   messages never sees a share, and a test checks that.
2. **Verify.** `j` decrypts and checks `s_{i→j}·G = Σ_k j^k·C_{i,k}`. A
   missing, undecryptable or inconsistent share means `j` complains about `i`.
3. **Respond.** An accused dealer must publish the disputed share. If it
   checks out against the dealer's commitments, `j` uses it. If not, or if
   the dealer stays silent, the dealer is disqualified.
4. **Finalize.** `QUAL` is the set of dealers with well-formed commitments,
   no equivocation, and no unanswered complaint. Then
   `y_j = Σ_{i∈QUAL} s_{i→j}`, `Y = Σ_{i∈QUAL} C_{i,0}`, and the verification
   keys follow from the commitments alone. Everything is computed from the
   public transcript, so every honest validator, and any auditor, derives
   the same `QUAL` and keys. The DKG aborts if `|QUAL| < t`. Each validator
   also checks that `y_j·G` matches its public `Y_j`.

Each validator persists only its own share, in
`data/validators/validator-<i>.json` (mode 0600). The public transcript goes
to `dkg-transcript.json` for audit.

| DKG property | Test (`dkg.test.ts`) |
|---|---|
| Any t shares interpolate to the secret behind `Y`, and orders decrypt | "consistent t-of-n key" |
| The coordinator never sees a secret share | "never sees a secret share" |
| Bad share + honest reveal: complaint resolved, dealer kept | "answers the complaint honestly" |
| Bad share + lying reveal: dealer disqualified, key still works | "lies when accused" |
| Too few qualified dealers: abort | "too many dealers are disqualified" |
| Misrouted or cross-session replayed shares are rejected | "wrong recipient", "another DKG session" |
| Malformed or equivocating commitments: disqualified | "equivocating commitments" |

**Known DKG limitations:**

- *Key bias.* Plain Joint-Feldman lets a dealer who waits for the others'
  commitments bias the **distribution** of `Y`. It still can't learn `y`.
  GJKR fixes this with Pedersen commitments in round 1, and only round 1
  changes.
- *Broadcast channel.* The protocol assumes everyone sees the same
  broadcasts, but the coordinator relaying them could show validators
  different views. Each validator signs its final result together with a
  hash of the transcript it verified, and the coordinator aborts unless all
  of them match. A coordinator that lies anyway can only produce
  inconsistent keys (an availability failure). It can't extract `y`.

## Validators as separate processes

Each validator can run as its own OS process (`src/validator/main.ts`),
holding its own key share and an ed25519 **identity key**. The backend
reaches validators over HTTP through `RemoteValidator`, which implements the
same `ValidatorNode` interface as the in-process `LocalValidator`. Run
`npm run validators:dev` to start 5 such processes.

Once messages cross a network, the coordinator routing them is treated as
**hostile**. Each attack below is blocked, and `dkgAdversarial.test.ts`
covers it:

| Coordinator attack | Defence |
|---|---|
| Swap a validator's DKG transport key for its own, to read the shares sent to it | Transport keys are signed by the validator's identity key. Dealers refuse to deal if any key is missing or forged. |
| Forge complaints so dealers publicly reveal shares | Complaints must be signed by the complainer. Unsigned ones are ignored. |
| Drop shares so the victim complains and the reveal leaks its share | A *missing* share aborts the DKG instead of producing a complaint, so dropping messages only stalls it. |
| Alter or forge broadcasts | Broadcasts are signed. Altered ones are dropped identically by every validator. |
| Replay messages from an earlier DKG | Every signed payload carries the session id. |
| Re-key validators that already hold a share | Validators refuse to start a new DKG while holding a key. |
| Ask validators for decryption shares directly | Every validator route requires the coordinator's bearer token. |

Verified end to end: 5 separate validator processes ran the DKG over HTTP
and an order was submitted, decrypted and settled. After 2 processes were
killed and the backend restarted, it reused the same key and still settled.
`remoteValidators.test.ts` covers the same flows in CI.

## Batch sealing on-chain

Before any decryption, the backend seals the batch by calling
`order-vault.create_batch(batch_id, n, H)`, where

```
H = sha256("cipher-protocol/batch-commitment/v1" ‖ u32be(n) ‖ Σ u32be(len(ct_i)) ‖ ct_i)
```

over the batch's ciphertexts **in settlement order**. The length prefixes
prevent boundary collisions, and the ordering matters because order is what
front-running exploits. The contract refuses to re-seal a batch id, and the
record is public and timestamped.

**Every validator checks this itself.** When asked for decryption shares
for `(batch_id, [ct_1 … ct_n])`, a validator reads `get_batch(batch_id)`
from Soroban through a read-only simulation (no account or funds needed),
recomputes `H`, and refuses unless the count and hash match exactly. So
neither the backend nor anyone holding every validator's API token can:

- decrypt a pending order before its batch is publicly sealed;
- add, drop, swap or reorder ciphertexts after sealing;
- decrypt anything without leaving a public, timestamped commitment first.

There is deliberately **no silent fallback**. A validator without a ledger
refuses to decrypt. Local development without a deployed contract uses an
in-memory stand-in that only works for in-process validators, and separate
validator processes must opt out explicitly with
`VALIDATOR_INSECURE_SKIP_COMMITMENT_CHECK=1`, which they warn about loudly.
The deployed testnet `order-vault` needed **no redeploy**: it already stored
`(order_count, content_hash, timestamp)`. What changed is that the hash now
commits to ciphertexts rather than order ids, and that validators verify it.

## What is still trusted, and what's next

Being honest about the remaining gaps:

1. **The coordinator chooses which orders go into a batch.** It can't
   decrypt anything without sealing it publicly first. But it could censor
   orders, or seal very small batches. Next step: validators enforce a batch
   policy (minimum size or age) before contributing.
2. **Settlement isn't bound to the seal on-chain.** `settle_batch` doesn't
   yet check that the batch id was sealed in `order-vault` with a matching
   order count.
3. **Validators trust their Soroban RPC endpoint** to report the chain
   honestly. Production validators should each query their own RPC node.
4. **Independent operators.** The code supports one validator per machine,
   but the dev cluster runs all of them on one host, and the default dev
   mode keeps them in-process. Real decentralization means deploying
   validators run by different parties. Their HTTP transport should then
   sit behind TLS.
5. **The coordinator is the backend.** After combining shares, the backend
   sees the plaintext, but only for batches already sealed on-chain. Moving
   combination into the settlement transaction is future work.
6. **DKG key bias** (see above): upgrade round 1 to Pedersen commitments.

The [contributor issues](CONTRIBUTOR_ISSUES.md) track each of these.
