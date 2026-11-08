# Contributing to Fidara Network

Thank you for your interest in contributing.

---

## How to pick an issue

Browse the [issue tracker](../../issues). Issues labelled **good first issue** are
suitable for new contributors. Comment on the issue to let others know you are working
on it before you start.

---

## Branch and PR rules

- Branch from `master`.
- Name branches `feature/<short-description>` or `fix/<short-description>`.
- Keep one logical change per PR.
- Link the PR to the issue it resolves with `Closes #<issue-number>` in the PR
  description.
- PR titles must be concise (under 70 characters).
- All checks in CI must pass before a PR may be merged.

---

## Local setup

### Prerequisites

See the README for the full list. You need Rust (≥ 1.91.0), Stellar CLI (28.1.0),
Node.js (26.x) and npm (11.x).

### Clone and install

```bash
git clone https://github.com/Fayedamz/fidara-network.git
cd fidara-network
cd webapp && npm ci && cd ..
```

### Run the contract checks

```bash
cd contracts
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

### Run the webapp checks

```bash
cd webapp
npx tsc --noEmit   # typecheck
npm test           # 52 unit tests
npm run build      # production build
```

---

## Checks to run before opening a PR

All of these must pass:

| Check | Command |
|-------|---------|
| Rust formatting | `cargo fmt --check` (in `contracts/`) |
| Rust lints | `cargo clippy -- -D warnings` (in `contracts/`) |
| Contract tests | `cargo test` (in `contracts/`) |
| TypeScript typecheck | `npx tsc --noEmit` (in `webapp/`) |
| Webapp tests | `npm test` (in `webapp/`) |
| Webapp build | `npm run build` (in `webapp/`) |

CI runs the same checks automatically on every push and pull request.

---

## Code standards

### Contract (Rust)

- No `unwrap()` or `expect()` in non-test code. Return `Result<_, FidaraError>` instead.
- All errors are variants of `FidaraError`; add a new variant rather than reusing an
  approximate one.
- Every state-changing public function must emit an event via `env.events().publish(…)`.
- Auth must be the first call in every function that requires it.
- No secrets (private keys, mnemonics) anywhere in the source.

### Web app (TypeScript / React)

- All types must be explicit; no `any`.
- The app must never handle or store secret keys.
- All user-facing text must name the correct role (learner, mentor, forfeit recipient).
- Tests must cover all new pages and helpers.

---

## Reporting bugs

Open an issue on GitHub with:

1. What you expected to happen.
2. What actually happened (include error messages and transaction hashes where relevant).
3. Steps to reproduce.
4. Environment (OS, browser, Rust version, Stellar CLI version).

Security vulnerabilities should be reported privately — see [SECURITY.md](SECURITY.md).
