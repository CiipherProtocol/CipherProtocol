# Threshold order encryption

How Cipher Protocol keeps a swap order secret until the batch it belongs to
is sealed, and what is still simulated.

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
| Ordering is fixed before contents are known | The batch is sealed (and attested on-chain) before decryption is requested | `batchingService.runOnce` |

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
  broadcasts. In-process, that's trivially true. With remote validators,
  broadcasts must be signed by their sender, and equivocation (two different
  commitments from one dealer) is already treated as disqualifying.

## What is simulated, and what's next

Being honest about the remaining gaps:

1. **Validators run in-process.** This is now the main gap. The DKG means
   no dealer ever knows `y`. But all five `SimulatedValidator`s live in the
   backend process, and their key files sit on one disk, so whoever operates
   that machine could still read `t` shares. The fix is to run each
   validator on its own machine with its own operator. The `ValidatorNode`
   interface (decryption *and* DKG rounds) is async and per-validator, so a
   remote client can replace `SimulatedValidator` without changing the
   coordinator or `runDkg`. Each real validator should also check the
   batch's on-chain attestation before releasing shares.
2. **The coordinator is the backend.** After combining shares, the backend
   sees the plaintext, but only for sealed batches. Moving combination
   on-chain or into the settlement transaction is future work.
3. **DKG key bias** (see above): upgrade round 1 to Pedersen commitments.

The [contributor issues](CONTRIBUTOR_ISSUES.md) track each of these.
