# Fidara Network — Roles, States & Transitions

## Parties

| Role | Description | Constraints |
|------|-------------|-------------|
| **Learner** | Stakes tokens against milestones they commit to deliver | Must differ from `mentor` |
| **Mentor** | Accepts the plan terms, then reviews milestone submissions (verify or reject) | Must differ from `learner`; must differ from `forfeit_recipient` |
| **Forfeit Recipient** | Receives stake for milestones the learner never delivered | Must differ from `mentor` |

### Why these constraints?
- `learner ≠ mentor` — prevents self-approval of milestones.
- `mentor ≠ forfeit_recipient` — prevents the mentor from profiting by rejecting milestones (silent sabotage attack).
- Stake can only ever flow to **learner** or **forfeit_recipient**, never to the mentor.
- The mentor must **accept** the plan before any milestone work begins, so the mentor cannot later claim they never agreed to the review window or deadline.

---

## Plan States

A `Plan` is created once and holds N milestones (1–12).

```
PlanStatus: AwaitingMentor → Active → Completed
                          ↘ Cancelled  (learner cancels before acceptance)
```

| Status | Meaning |
|--------|---------|
| `AwaitingMentor` | Created by learner, not yet accepted by mentor. Milestone actions are blocked. |
| `Active` | Mentor accepted. Milestones may be submitted, reviewed, forfeited. |
| `Completed` | All milestones have reached a terminal state (Verified or Forfeited). |
| `Cancelled` | Learner cancelled while AwaitingMentor. Full stake refunded to learner. |

---

## Milestone States

Each milestone independently progresses through its own state machine.
Milestone actions are only available while the plan is **Active**.

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
- **Caller:** Learner (requires auth)
- **Effect:** Validates inputs; transfers `stake_amount` from learner to contract; creates plan with N milestones in `Pending`; status = `AwaitingMentor`.
- **Preconditions:**
  - `stake_amount > 0`
  - `milestone_count` ∈ [1, 12]
  - `review_window_ledgers >= MIN_REVIEW_WINDOW_LEDGERS` (= 17 280 ledgers ≈ 1 day)
  - `deadline_ledger > current_ledger + review_window_ledgers`
  - `learner ≠ mentor`
  - `mentor ≠ forfeit_recipient`
- **Stake split:** Each milestone gets `stake_amount / milestone_count`; rounding remainder goes to last milestone.
- **Cheats blocked:** None of the milestone invariants apply yet — the mentor has not agreed.

### 2. `accept_plan(plan_id)`
- **Caller:** Mentor (requires auth)
- **Preconditions:** Plan is `AwaitingMentor`; current ledger ≤ `deadline_ledger`.
- **Effect:** Plan → `Active`. Milestone actions now enabled.
- **Time:** If the mentor never accepts before the deadline, the learner can cancel and recover the stake.
- **Cheats blocked:** Only the named mentor can accept; accepting after the deadline is rejected.

### 3. `cancel_plan(plan_id)`
- **Caller:** Learner (requires auth)
- **Preconditions:** Plan is `AwaitingMentor`.
- **Effect:** Plan → `Cancelled`; full `stake_amount` refunded to learner.
- **Cheats blocked:** Cannot cancel an Active plan; cannot cancel twice.

### 4. `submit_milestone(plan_id, index)`
- **Caller:** Learner only
- **Preconditions:** Plan is `Active`; milestone is `Pending`; current ledger ≤ `deadline_ledger`.
- **Effect:** Milestone → `Submitted`; records submission ledger.
- **Cheats blocked:** Rejected on `AwaitingMentor` or `Cancelled` plans.

### 5. `verify_milestone(plan_id, index)`
- **Caller:** Mentor only
- **Preconditions:** Plan is `Active`; milestone is `Submitted`.
- **Effect:** Milestone → `Verified`; stake share paid to learner.
- **Cheats blocked:** Rejected on non-Active plans; learner cannot self-approve (learner ≠ mentor).

### 6. `reject_milestone(plan_id, index)`
- **Caller:** Mentor only
- **Preconditions:** Plan is `Active`; milestone is `Submitted`; within `review_window_ledgers` of submission.
- **Effect:** Milestone → `Pending` (learner may resubmit before deadline).
- **Cheats blocked:** Rejection after the review window is rejected (use `claim_unreviewed` instead).

### 7. `claim_unreviewed(plan_id, index)`
- **Caller:** Anyone
- **Preconditions:** Plan is `Active`; milestone is `Submitted`; current ledger > `submitted_at + review_window_ledgers`.
- **Effect:** Milestone → `Verified`; stake share paid to learner.
- **Purpose:** Prevents a silent/inactive mentor from trapping stake indefinitely.
- **Cheats blocked:** Cannot be called while the review window is still open; rejected on `AwaitingMentor` plans (where the mentor never agreed and no submissions exist).

### 8. `forfeit_milestone(plan_id, index)`
- **Caller:** Anyone
- **Preconditions:** Plan is `Active`; milestone is `Pending`; current ledger > `deadline_ledger`.
- **Effect:** Milestone → `Forfeited`; stake share paid to forfeit recipient.
- **Note:** A `Submitted` milestone is handled by `claim_unreviewed`, not this function.
- **Cheats blocked:** Cannot forfeit a Submitted milestone; rejected on non-Active plans.

### 9. `extend_plan(plan_id)`
- **Caller:** Anyone
- **Preconditions:** Plan exists (any status).
- **Effect:** Bumps the contract instance and data TTL.

### 10. `get_plan(plan_id)`
- **Caller:** Anyone (read-only)
- **Preconditions:** Plan exists (any status).
- **Effect:** Returns the full plan struct.

---

## Money Flow Summary

```
Stake deposited at create_plan (plan = AwaitingMentor)
         │
         ├─ cancel_plan (while AwaitingMentor)         ──▶  Learner (full refund)
         │
         │   [mentor accepts → Active]
         │
         ├─ verify_milestone / claim_unreviewed         ──▶  Learner (per-milestone share)
         │
         └─ forfeit_milestone                           ──▶  Forfeit Recipient
                                                              (never Mentor)
```

---

## Security Properties

| Attack | Defence |
|--------|---------|
| Learner self-approves | `learner ≠ mentor` enforced at plan creation |
| Learner sets tiny review window, submits all milestones, waits one ledger, calls claim_unreviewed | `MIN_REVIEW_WINDOW_LEDGERS` = 17 280 (≈ 1 day); mentor must `accept_plan` before milestone actions work |
| Mentor profits from rejection | `mentor ≠ forfeit_recipient` enforced at plan creation |
| Mentor traps stake by never reviewing | `claim_unreviewed` available to anyone after review window |
| Mentor traps stake by never accepting | Learner may call `cancel_plan` while `AwaitingMentor` for full refund |
| Anyone forfeits a submitted milestone | `forfeit_milestone` rejects `Submitted` state |
| Learner resubmits after verify | `submit_milestone` rejects non-`Pending` state |
| Double verify/reject | State check before any transition |
| Stake flows to mentor | Token transfer only to `learner` or `forfeit_recipient` |
| Zero-stake plan | `stake_amount > 0` enforced at plan creation |
| Deadline in the past | `deadline_ledger > current_ledger + review_window_ledgers` enforced |
