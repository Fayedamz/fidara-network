# Fidara Network v0.1

Commitment contracts for learning on Stellar Soroban.

A learner stakes tokens against milestones. A mentor reviews. A forfeit recipient receives stake for any milestone the learner fails to deliver. The mentor can never receive stake.

---

## Project structure

```
fidara-network/
├── contracts/
│   └── fidara/          # Soroban smart contract (Rust)
│       └── src/
│           ├── lib.rs
│           ├── contract.rs   # 8 public functions
│           ├── types.rs
│           ├── errors.rs
│           ├── storage.rs
│           └── tests.rs      # 42 tests
├── docs/
│   └── ROLES.md         # State machine & security doc
├── webapp/              # React + Vite + TypeScript frontend
│   └── src/
│       ├── lib/         # ledger helpers, wallet, contract client
│       ├── hooks/       # useWallet
│       ├── components/  # WalletBar, MilestoneRow
│       ├── pages/       # CreatePlan, LearnerDashboard, MentorPage
│       └── tests/       # 37 passing tests
└── .env.example
```

---

## Contract

### Prerequisites

- Rust 1.78+ with `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli)

```bash
rustup target add wasm32-unknown-unknown
cargo install stellar-cli --features opt
```

### Build

```bash
cd contracts
cargo build --release --target wasm32-unknown-unknown
```

### Test

```bash
cd contracts
cargo test
```

### Deploy to Testnet

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/fidara.wasm \
  --source <YOUR_SECRET_KEY> \
  --network testnet
```

Copy the returned contract address into `webapp/.env` as `VITE_CONTRACT_ID`.

---

## Web app

### Prerequisites

Node 18+ and npm.

### Setup

```bash
cd webapp
cp ../.env.example .env
# Edit .env with your contract address and base ledger
npm install
```

### Dev server

```bash
npm run dev
```

### Tests

```bash
npm test
```

### Build

```bash
npm run build
```

---

## Wallet

The app uses [Freighter](https://www.freighter.app/) — a browser extension wallet for Stellar. Install it, create a Testnet account, and fund it at [friendbot](https://laboratory.stellar.org/#account-creator?network=test). The app never handles secret keys.

---

## Role rules

| Rule | Enforced |
|------|---------|
| Learner ≠ Mentor | At `create_plan` — `LearnerIsMentor` error |
| Mentor ≠ Forfeit recipient | At `create_plan` — `MentorIsForfeitRecipient` error |
| Stake never to mentor | Token transfer only to learner or forfeit recipient |
| Silent mentor can't trap stake | `claim_unreviewed` callable by anyone after review window |

See [docs/ROLES.md](docs/ROLES.md) for the full state machine.
