# Fidara Network — Roles, States & Transitions

## Parties

| Role | Description | Constraints |
|------|-------------|-------------|
| **Learner** | Stakes tokens against milestones they commit to deliver | Must differ from `mentor` |
| **Mentor** | Reviews milestone submissions (verify or reject) | Must differ from `learner`; must differ from `forfeit_recipient` |
| **Forfeit Recipient** | Receives stake for milestones the learner never delivered | Must differ from `mentor` |

### Why these constraints?
- `learner ≠ mentor` — prevents self-approval of milestones.
- `mentor ≠ forfeit_recipient` — prevents the mentor from profiting by rejecting milestones (silent sabotage attack).
- Stake can only ever flow to **learner** or **forfeit_recipient**, never to the mentor.

---

## Plan States

A `Plan` is created once and holds N milestones (1–12).

```
Plan { status: Active | Completed | Cancelled }
```

| Status | Meaning |
|--------|---------|
| `Active` | Default after `create_plan`. Milestones are being worked. |
| `Completed` | All milestones have reached a terminal state (Verified or Forfeited). |

---

## Milestone States

Each milestone independently progresses through its own state machine.

```
Pending → Submitted → Verified  (stake → learner)
                   ↘ Rejected → Pending  (learner may resubmit)
Pending → Forfeited             (stake → forfeit_recipient, after deadline)
Submitted → Verified (via claim_unreviewed, after review window)
```

| State | Meaning |
|-------|---------|
| `Pending` | Not yet submitted (initial state, or after rejection) |
| `Submitted` | Learner has submitted; awaiting mentor review |
| `Verified` | Mentor confirmed delivery — stake share paid to learner |
| `Forfeited` | Missed deadline without ever being submitted/verified — stake share paid to forfeit recipient |

---

## Transitions

### 1. `create_plan`
- **Caller:** Anyone (deployer/learner typically)
- **Effect:** Transfers `stake_amount` from caller to contract; creates Plan with N milestones in `Pending`.
- **Preconditions:** `milestone_count` ∈ [1, 12]; `learner ≠ mentor`; `mentor ≠ forfeit_recipient`.
- **Stake split:** Each milestone gets `stake_amount / milestone_count`; rounding remainder goes to last milestone.

### 2. `submit_milestone(plan_id, index)`
- **Caller:** Learner only
- **Preconditions:** Milestone is `Pending`; current ledger ≤ `deadline_ledger`; Plan is `Active`.
- **Effect:** Milestone → `Submitted`; records submission ledger for review window calculation.

### 3. `verify_milestone(plan_id, index)`
- **Caller:** Mentor only
- **Preconditions:** Milestone is `Submitted`; Plan is `Active`.
- **Effect:** Milestone → `Verified`; transfers milestone share to learner.

### 4. `reject_milestone(plan_id, index)`
- **Caller:** Mentor only
- **Preconditions:** Milestone is `Submitted`; within `review_window_ledgers` of submission; Plan is `Active`.
- **Effect:** Milestone → `Pending` (learner may resubmit before deadline).

### 5. `claim_unreviewed(plan_id, index)`
- **Caller:** Anyone
- **Preconditions:** Milestone is `Submitted`; current ledger > `submission_ledger + review_window_ledgers`; Plan is `Active`.
- **Effect:** Milestone → `Verified`; transfers milestone share to learner.
- **Purpose:** Prevents a silent/inactive mentor from trapping stake indefinitely.

### 6. `forfeit_milestone(plan_id, index)`
- **Caller:** Anyone
- **Preconditions:** Milestone is `Pending`; current ledger > `deadline_ledger`; Plan is `Active`.
- **Effect:** Milestone → `Forfeited`; transfers milestone share to forfeit recipient.
- **Note:** A `Submitted` milestone that was never reviewed is handled by `claim_unreviewed`, not this function — forfeiting a submitted milestone is rejected.

### 7. `extend_plan(plan_id)`
- **Caller:** Anyone
- **Effect:** Bumps the contract instance and data TTL (keeps the plan alive on-ledger).

### 8. `get_plan(plan_id)`
- **Caller:** Anyone (read-only)
- **Effect:** Returns the full plan struct.

---

## Money Flow Summary

```
Stake deposited at create_plan
         │
         ├─ verify_milestone / claim_unreviewed  ──▶  Learner
         │
         └─ forfeit_milestone                    ──▶  Forfeit Recipient
                                                      (never Mentor)
```

---

## Security Properties

| Attack | Defence |
|--------|---------|
| Learner self-approves | `learner ≠ mentor` enforced at plan creation |
| Mentor profits from rejection | `mentor ≠ forfeit_recipient` enforced at plan creation |
| Mentor traps stake by ignoring | `claim_unreviewed` available to anyone after review window |
| Anyone forfeits a submitted milestone | `forfeit_milestone` rejects `Submitted` state |
| Learner resubmits after verify | `submit_milestone` rejects non-`Pending` state |
| Double verify/reject | State check before any transition |
| Stake flows to mentor | Token transfer only to `learner` or `forfeit_recipient` |
