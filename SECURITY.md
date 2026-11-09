# Security Policy

## Status

**Fidara Network v0.1 has not been audited.**

This is an early release that runs on **Stellar Testnet only**. Do not use it with real
funds. Do not deploy it to Stellar Mainnet.

---

## Scope

The following are in scope for security reports:

- The `fidara` Soroban smart contract (`contracts/fidara/`)
- The React web app (`webapp/`) — particularly anything that could expose user keys or
  sign transactions without the user's knowledge

The following are **out of scope**:

- Stellar protocol or network-level issues (report those to the Stellar Development
  Foundation)
- Issues in third-party dependencies (report to the upstream maintainer)
- UI cosmetic bugs

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately using one of these channels:

1. **GitHub private vulnerability reporting** — go to the
   [Security tab](../../security) of this repository and click
   **"Report a vulnerability"**.
2. **Email** — send a report to `<olqudsaint@gmail.com>` with the subject line
   `[fidara-network] Security vulnerability`.

Include:

- A description of the vulnerability.
- Steps to reproduce.
- The potential impact.
- Any suggested fixes, if you have them.

We will acknowledge receipt within a few business days and aim to provide a resolution
timeline within two weeks. We will credit reporters in the changelog unless you prefer
to remain anonymous.

---

## Limitations

This contract has known limitations that are design constraints rather than
vulnerabilities. Please read [docs/LIMITATIONS.md](docs/LIMITATIONS.md) before filing
a report.
