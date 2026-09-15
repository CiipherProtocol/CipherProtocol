# Contributing to Cipher Protocol

Thanks for picking this up. Quick orientation before you start:

## Where things live

- [`frontend/`](frontend/README.md) — React/TS/Vite
- [`backend/`](backend/README.md) — Express/TS API
- [`contracts/`](contracts/README.md) — Soroban contracts (Rust)

Each has its own README with setup and run instructions. Start there for
your area — this file only covers things common to all three.

## Before you pick up an issue

Read the root [README's Status section](README.md#status). It lists exactly
what's real versus placeholder right now. Several open issues are about
replacing a placeholder — the comment at that placeholder's definition
usually explains what it fakes and why, which is the fastest way to
understand the scope of the fix.

## Workflow

1. Comment on the issue you want before starting, so two people don't build
   the same thing.
2. Fork, branch, implement.
3. **Run the relevant test suite before opening a PR:**
   - `contracts/`: `cargo test` (both contracts have real test coverage —
     match that bar for new contract code)
   - `backend/` / `frontend/`: `npx tsc --noEmit` at minimum; there's no
     automated test suite yet for either (that's an open issue itself) —
     if your change is hard to verify by hand, a smoke test is welcome.
4. Open a PR describing what changed and, for anything touching the
   contracts or backend's Soroban integration, how you verified it (unit
   test, or a testnet call with the tx hash).

## Conventions

- No comments explaining *what* code does — only *why*, when it's
  non-obvious (a workaround, a constraint, a footgun). The existing code is
  a good reference for the level of comment density expected.
- Don't add abstractions or config options for hypothetical future needs.
  If a placeholder needs replacing, replace it — don't wrap it in a feature
  flag.
- If you're touching a Soroban contract, prefer extending its existing test
  file over adding a new one; see `contracts/*/src/test.rs` for the style
  (deploy in a `setup()` helper, one behavior per test, explicit "no
  mock_all_auths" tests where auth-gating is the thing being proven).

## Security

Two known gaps — encryption (placeholder AES/base64) and auth (placeholder
header, no signature verification) — are already tracked as issues, not
secret. If you find a *new* security issue, please don't open a public issue
for it; reach out to a maintainer directly first.
