# Fidara Network v0.1

> **Testnet only. Not audited. Do not use with real funds.**

Commitment contracts for learning on Stellar Soroban. A learner stakes tokens against
milestones they commit to deliver. A mentor accepts the plan, then reviews each
submission. A forfeit recipient receives stake for any milestone the learner fails to
deliver on time. The mentor never receives stake.

---

## Project structure

```
fidara-network/
├── contracts/
│   └── fidara/               # Soroban smart contract (Rust)
│       └── src/
│           ├── lib.rs
│           ├── contract.rs   # 10 public functions
│           ├── types.rs
│           ├── errors.rs
│           ├── storage.rs
│           └── tests.rs      # contract tests
├── docs/
│   ├── ROLES.md              # State machine and role rules
│   ├── AUTHORIZATION.md      # Who may call each function
│   ├── DECISIONS.md          # Toolchain and design choices
│   └── LIMITATIONS.md        # Known limitations
├── webapp/                   # React + Vite + TypeScript frontend
│   └── src/
│       ├── lib/              # ledger helpers, wallet, contract client
│       ├── hooks/            # useWallet
│       ├── components/       # WalletBar, MilestoneRow
│       ├── pages/            # CreatePlan, LearnerDashboard, MentorPage
│       └── tests/            # webapp tests
├── rust-toolchain.toml
├── .env.example
└── .github/workflows/ci.yml
```

---

## Prerequisites

You need these tools before following the quickstart.

| Tool | Version used | Source |
|------|-------------|--------|
| Rust | 1.93.0 | [rustup.rs](https://rustup.rs) |
| Rust target `wasm32v1-none` | (bundled with toolchain) | `rustup target add wasm32v1-none` |
| Stellar CLI | 28.1.0 | see below |
| Node.js | 26.x | [nodejs.org](https://nodejs.org) |
| npm | 11.x | bundled with Node |
| Freighter wallet extension | latest | [freighter.app](https://www.freighter.app) |

**Install Stellar CLI (Windows):**
```powershell
winget install --id Stellar.StellarCLI
```

**Install Stellar CLI (macOS / Linux):**
```bash
brew install stellar-cli
# or
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
```

Source: [Stellar Docs — Install the CLI](https://developers.stellar.org/docs/tools/cli/install-cli)

---

## Build the contract

```bash
cd contracts
stellar contract build
```

This produces `contracts/target/wasm32v1-none/release/fidara.wasm`.

The `stellar contract build` command is equivalent to
`cargo build --release --target wasm32v1-none` but also optimises and strips the output.

> **Not verified on this machine** — the `wasm32v1-none` target and Stellar CLI are not
> installed in the current environment due to network restrictions. The contract compiles
> cleanly under `cargo check` and `cargo clippy`.

---

## Run contract tests

```bash
cd contracts
cargo test
```

> **Partially blocked** — `cargo test` currently fails to compile `soroban-env-host
> 22.1.3` due to an upstream rand_core version conflict. See docs/DECISIONS.md §D-006
> for details. `cargo check` and `cargo clippy -- -D warnings` both pass.

---

## Create an identity and fund it

```bash
# Create a named keypair (stored locally by the CLI)
stellar keys generate alice --network testnet

# Fund with testnet XLM via Friendbot
stellar keys fund alice --network testnet
```

Source: [Stellar Docs — Getting started](https://developers.stellar.org/docs/smart-contracts/getting-started/setup)

> **Not verified on this machine** — requires Stellar CLI and network access.

---

## Deploy to testnet

```bash
stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/fidara.wasm \
  --source alice \
  --network testnet
```

The command prints the contract address (a `C…` string). Copy it — you need it below.

> **Not verified on this machine.**

---

## Get a stake token contract ID

The simplest stake token for testing is the Stellar native asset (XLM) wrapped as a
Soroban contract. Obtain its testnet address with:

```bash
stellar contract id asset --asset native --network testnet
```

Source: [Stellar Docs — contract id asset](https://developers.stellar.org/docs/tools/cli/stellar-cli/contract/id/asset)

> **Not verified on this machine.**

---

## Configure the web app

```bash
cd webapp
cp ../.env.example .env
```

Edit `.env`:

```env
# The deployed Fidara contract address from the deploy step above
VITE_CONTRACT_ID=C…

# Get the current ledger number with: stellar ledger --network testnet
VITE_BASE_LEDGER=0

# Unix timestamp in milliseconds for the ledger above: Date.now() in the browser console
VITE_BASE_TIMESTAMP_MS=0

# Network guard — must be "testnet"
VITE_NETWORK=testnet
```

The `VITE_BASE_LEDGER` and `VITE_BASE_TIMESTAMP_MS` values are used to convert ledger
numbers to approximate dates in the UI. They do not need to be exact; approximate values
from `stellar ledger --network testnet` are fine.

---

## Run the web app

```bash
cd webapp
npm ci        # reproducible install from package-lock.json
npm run dev   # starts the Vite dev server
```

Open `http://localhost:5173` in a browser that has Freighter installed.

---

## Walk through a plan — testnet tutorial

> All steps below require Stellar CLI, a deployed contract, and Freighter wallets for
> the learner, mentor and forfeit recipient. **Not verified end-to-end on this machine.**
> Steps marked ✓ have been verified locally; steps marked ✗ have not.

1. **Create accounts** — Generate and fund at least two testnet accounts (learner and
   mentor) as shown in the "Create an identity" section above.

2. **Create a plan** (✗ requires deployed contract)
   - Connect the learner's Freighter wallet.
   - Go to the **Create Plan** page.
   - Fill in the mentor's address, a forfeit recipient, a stake amount (in stroops, where
     1 XLM = 10 000 000 stroops), 1–12 milestones, a deadline at least 1 day in the
     future, and a review window of at least 1 day.
   - Click **Create Plan**. Freighter will ask you to sign and broadcast the transaction.
   - The page shows the plan ID and confirms the plan is **Awaiting Mentor**.

3. **Accept the plan** (✗ requires deployed contract)
   - Connect the mentor's Freighter wallet.
   - Go to the **Mentor** page.
   - Enter the plan ID. The invitation banner appears with the plan terms.
   - Click **Accept plan as mentor**. After confirmation, the plan becomes **Active**.

4. **Submit a milestone** (✗ requires deployed contract)
   - Connect the learner's Freighter wallet.
   - Go to the **Learner** page.
   - Enter the plan ID. Milestone rows appear with **Submit** buttons.
   - Click **Submit** for milestone 1. The status changes to **Awaiting Review**.

5. **Verify a milestone** (✗ requires deployed contract)
   - Connect the mentor's Freighter wallet.
   - Go to the **Mentor** page.
   - Click **Verify** for the submitted milestone. The stake share is paid to the learner.
   - After all milestones are terminal, the plan status changes to **Completed**.

6. **Claim unreviewed** (✗)
   - If the mentor does not review within the review window, anyone can click
     **Claim (review window passed)** on the Learner page to release the stake to the
     learner.

---

## Webapp tests

```bash
cd webapp
npm test      # 52 tests, all passing (verified)
npm run build # production build (verified)
```

---

## Notes

- This is v0.1, testnet only, and has not been audited.
- Plans need periodic `extend_plan` calls to stay readable on-ledger over long periods
  (see docs/LIMITATIONS.md).
- Deadlines are ledger-based; the displayed dates are approximations.
- See [docs/ROLES.md](docs/ROLES.md) for the full state machine and security properties.
- See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for known limitations.
