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

**Setup (t-of-n).** The group secret `y` is split with Shamir secret sharing
into shares `y_1 … y_n`. Validator `i` holds `y_i`. Everyone knows the group
key `Y = y·G` and each validator's verification key `Y_i = y_i·G`.

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

## What is simulated, and what's next

Being honest about the remaining gaps:

1. **Trusted-dealer keygen.** One process generates `y` and splits it, so at
   that moment it knows `y`. Production needs a distributed key generation
   (Pedersen/Feldman DKG) so `y` never exists in one place.
2. **Validators run in-process.** `SimulatedValidator` implements the
   `ValidatorNode` interface, and all five live in the backend with their
   shares in one dev-only file. The interface is async and per-validator,
   so a remote validator (HTTP/gRPC client) can replace it without changing
   the coordinator. Each real validator should also check the batch's
   on-chain attestation before releasing shares.
3. **The coordinator is the backend.** After combining shares, the backend
   sees the plaintext, but only for sealed batches. Moving combination
   on-chain or into the settlement transaction is future work.

The [contributor issues](CONTRIBUTOR_ISSUES.md) track each of these.
