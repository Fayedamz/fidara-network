# Fidara Network — Design Decisions

## D-001: Ledger close time and MIN_REVIEW_WINDOW_LEDGERS

**Source:** [Stellar Developer Docs — Ledgers](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers)
and the Stellar homepage: "Ledgers close in ~5 seconds."

**Decision:** One day ≈ 86 400 s ÷ 5 s/ledger = 17 280 ledgers.

`MIN_REVIEW_WINDOW_LEDGERS` is set to **17 280** (one day).

A learner cannot set a window so small that they can submit a milestone, wait a few
ledgers, and immediately call `claim_unreviewed` to recover stake with no mentor
involvement.

---

## D-002: AwaitingMentor plan status

**Problem:** The original design let the learner choose the review window unilaterally.
A learner could set `review_window_ledgers = 1`, submit, wait one ledger, and call
`claim_unreviewed` — recovering the full stake with no mentor involvement.

**Decision:** Plans start in `AwaitingMentor`. Milestone operations are blocked until the
mentor calls `accept_plan`, meaning the mentor has seen and agreed to the review window
and deadline. The learner can cancel while awaiting and receive a full refund.

**Why a separate `accept_plan` step?** It is the only way to establish that the named
mentor has seen the terms. Without it, a mentor could be named without their knowledge,
their silence would be misread as acceptance, and the only recourse would be the
learner's cancellation — which is weaker than explicit acceptance.

---

## D-003: Deadline and stake validation

**Problem:** `create_plan` did not validate `stake_amount` or `deadline_ledger`.

**Decision:**
- `stake_amount` must be > 0.
- `deadline_ledger` must be > `current_ledger + review_window_ledgers`, ensuring at least
  one full review window fits before the deadline.

---

## D-004: Public function count

After adding `accept_plan` and `cancel_plan`, the total is 10 public functions, within
the ≤ 12 limit.

---

## D-005: Events

**Source:** [Soroban examples — events contract](https://github.com/stellar/soroban-examples/blob/main/events/src/lib.rs)
and [Stellar Docs — Contract Events](https://developers.stellar.org/docs/learn/encyclopedia/contract-development/events).

soroban-sdk **22.x** uses the pre-Protocol 23 event API:

```rust
env.events().publish((topic_sym_1, topic_sym_2), data_value);
```

The `#[contractevent]` macro was introduced in Protocol 23 / soroban-sdk 23+. Because
the contract targets Protocol 22 (the current stable network), we use the older API.
All state-changing transitions emit one event with two `Symbol` topics (`fidara`,
`<action>`) and the relevant data as a tuple.

---

## D-006: Rust toolchain and soroban-sdk version

**soroban-sdk version:** `=22.0.11` (exact pin).

**Reason:** Protocol 22 is the current stable protocol on Stellar Testnet and Mainnet
at time of writing. The `22.x` SDK series targets Protocol 22. The `22.0.11` release is
the highest `22.x` patch available via the lock file resolution. It is pinned exactly to
prevent silent upgrades across major or minor boundaries.

**Source:** [crates.io — soroban-sdk](https://crates.io/crates/soroban-sdk)
and [rs-soroban-sdk releases](https://github.com/stellar/rs-soroban-sdk/releases).

**MSRV:** soroban-sdk 22.x requires Rust ≥ 1.81.0 (the `rust-version` field in the
SDK's Cargo.toml at the time of this pin read `1.91.0` on the main branch; we set
`1.91.0` as our stated MSRV).
Source: [rs-soroban-sdk/Cargo.toml](https://github.com/stellar/rs-soroban-sdk/blob/main/Cargo.toml)

**Toolchain pin:** `rust-toolchain.toml` pins channel `1.93.0` (current stable on this
machine, satisfies MSRV). Target: `wasm32v1-none`.

**Build target:** `wasm32v1-none` (not `wasm32-unknown-unknown`).
Source: [Stellar Docs — Install and deploy](https://developers.stellar.org/docs/build/guides/transactions/install-deploy-contract-with-code):
"The build generates a .wasm file in `target/wasm32v1-none/release/`."

**Build command:**
```bash
stellar contract build
```
This is the preferred command. It is equivalent to
`cargo build --release --target wasm32v1-none` but also optimises and strips the WASM
via the CLI.
Source: [Stellar Docs — Getting started setup](https://developers.stellar.org/docs/smart-contracts/getting-started/setup).

**Test command:** `cargo test` (using the `testutils` feature activated via dev-deps).

**Note on `cargo test` and soroban-env-host 22.1.3:** soroban-sdk `=22.0.11` hard-pins
`soroban-env-host = "=22.1.3"`. That version introduced `ed25519-dalek 3.0.0` which
pulls in `rand_core 0.10.1`, conflicting with `rand_core 0.6.4` used by
`rand_chacha` inside the same host. This causes a compile-time trait bound error:
`ChaCha20Rng: CryptoRng` not satisfied.

**Fix:** The workspace `contracts/Cargo.toml` uses `[patch.crates-io]` to redirect
`soroban-env-host`, `soroban-env-common`, `soroban-env-guest`, `soroban-env-macros`, and
`soroban-builtin-sdk-macros` to the git tag `v22.1.1`
(`https://github.com/stellar/rs-soroban-env`, tag `v22.1.1`,
SHA `6e700f29404b8dd6ab94c1c0068fe7fd6ef87b2a`). Version 22.1.1 uses
`ed25519-dalek 2.1.1` which is compatible with `rand_core 0.6.4`, and has no API
changes relative to 22.1.3 for the functionality we use.

---

## D-007: Stellar CLI version

**Version:** `28.1.0` (current stable at time of writing).
**Source:** [Stellar Developer Docs — Software Versions](https://developers.stellar.org/docs/networks/software-versions):
"Stellar CLI | 28.1."

**Install (Windows):**
```powershell
winget install --id Stellar.StellarCLI
```
**Install (macOS/Linux):**
```bash
brew install stellar-cli
# or
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
```
**Source:** [Stellar Docs — Install the CLI](https://developers.stellar.org/docs/tools/cli/install-cli)

---

## D-008: JavaScript/TypeScript dependencies

**@stellar/stellar-sdk:** `13.3.0` (exact).
Reason: v13 is the current stable release targeting Protocol 22 Soroban RPC. The RPC
namespace is exported as `rpc` (not `SorobanRpc`).
Source: [npmjs.com — @stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk).

**@stellar/freighter-api:** `2.0.0` (exact).
Reason: v2 is the current API; the app uses `isConnected`, `getPublicKey`, `setAllowed`,
`signTransaction` which are all present in this version. Note: the runtime returns bare
values (e.g. `isConnected` → `Promise<boolean>`), not the object-wrapped API described
in some docs for a different v2 variant; the installed types match this behaviour.

All other dependencies are pinned to the exact versions installed in `node_modules` to
ensure reproducible builds.
