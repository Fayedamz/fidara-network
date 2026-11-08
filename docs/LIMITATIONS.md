# Fidara Network — Known Limitations

This document describes the known limitations of the v0.1 contract. They are design
constraints, not bugs. Do not file security reports for items listed here.

---

## 1. Mentor rejection power

The mentor may reject a milestone and the learner may resubmit, but this cycle can
repeat until the deadline with no on-chain penalty. A mentor who rejects every
submission near the deadline effectively leaves the learner no time to resubmit
successfully. The available remedies are:

- Choose a mentor with a good-faith relationship.
- Set a deadline far enough in advance to allow multiple review cycles.
- If the review window elapses without a decision, `claim_unreviewed` releases the stake
  to the learner.

---

## 2. Learner chooses the mentor

The learner names the mentor at plan creation. There is no on-chain reputation system
or endorsement mechanism. The learner must perform this vetting off-chain.

---

## 3. Mentor and forfeit-recipient collusion

The contract enforces `mentor ≠ forfeit_recipient`. However, a colluding pair can use
separate addresses. The contract cannot prevent two parties from coordinating off-chain.
The constraint mitigates the most obvious conflict of interest (the mentor directly
receiving the forfeit) but does not eliminate indirect collusion.

---

## 4. Absent or hostile mentor

If the mentor never calls `accept_plan`, the plan stays in `AwaitingMentor` and the
learner can cancel to recover the full stake. Once the plan is `Active`, a mentor who
goes silent is handled by `claim_unreviewed`, which anyone can call after the review
window. A hostile mentor who keeps rejecting (see §1) cannot be overridden by the
contract; resolution depends on the review window expiring.

---

## 5. Deadline and date approximation

Deadlines are stored as ledger sequence numbers. The web app converts them to
approximate calendar dates using a configurable base ledger and the nominal 5-second
ledger close time. Actual ledger close times vary slightly, so displayed dates are
estimates. The contract enforces the ledger-number deadline, not the displayed date.

---

## 6. TTL and `extend_plan`

On-ledger data expires after a fixed number of ledgers (approximately 30 days at the
current TTL setting). Plans that are not extended will become inaccessible after that
window. Any address can call `extend_plan` to reset the TTL. Long-running plans should
have their TTL extended periodically.

---

## 7. Token contract trust

The contract accepts any Soroban token contract as the stake token. It does not validate
that the token conforms to the SEP-41 standard or has any particular behaviour. Using a
malicious or buggy token contract could cause unexpected results.

---

## 8. Testnet only

This version is deployed on Stellar Testnet. It has not been deployed to Mainnet. It
has not been audited.

---

## 9. Not audited

The contract has not undergone a formal security audit. Use at your own risk. Do not
use with real funds.
