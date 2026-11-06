# Security policy

Cipher Protocol is a testnet proof-of-concept. Do not use it with real funds.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
**Security → Report a vulnerability** tab on this repository, not in a
public issue. Include steps to reproduce and the affected commit. Expect an
acknowledgement within a few days.

## Scope

In scope: the threshold encryption and share verification
(`backend/src/crypto/`), validator coordination, wallet-signature auth, and
the Soroban contracts.

Known, already-documented limitations, and therefore not new reports: the
validators don't yet verify on-chain that a batch is sealed before
releasing shares; they're run by one party; and DKG uses Joint-Feldman,
which allows bias of the group key's distribution but not its disclosure. See
[docs/THRESHOLD_ENCRYPTION.md](docs/THRESHOLD_ENCRYPTION.md).

## Supply-chain hygiene

Every PR runs `scripts/check-source-integrity.sh`. It fails on
minified-length lines, code hidden behind long whitespace runs, and dynamic
code evaluation (`eval`, the `Function` constructor, large `atob` blobs).
Crypto dependencies are pinned to exact versions.
