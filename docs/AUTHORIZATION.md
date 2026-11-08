# Fidara Network — Authorization Reference

Every public function is listed below with who may call it, what auth the contract
checks, preconditions, possible errors, and the event emitted on success.

---

## `create_plan`

| Field | Value |
|-------|-------|
| **Caller** | The learner (any address; the learner authenticates themselves) |
| **Auth checked** | `learner.require_auth()` — the learner must sign the transaction |
| **Preconditions** | `stake_amount > 0`; `milestone_count` ∈ [1, 12]; `review_window_ledgers ≥ MIN_REVIEW_WINDOW_LEDGERS` (17 280); `deadline_ledger > current_ledger + review_window_ledgers`; `learner ≠ mentor`; `mentor ≠ forfeit_recipient` |
| **Effect** | Transfers stake from learner to contract; creates plan in `AwaitingMentor` |
| **Errors** | `InvalidStakeAmount`, `InvalidMilestoneCount`, `ReviewWindowTooShort`, `InvalidDeadline`, `LearnerIsMentor`, `MentorIsForfeitRecipient` |
| **Event** | `(fidara, created)` → `plan_id` |

---

## `accept_plan`

| Field | Value |
|-------|-------|
| **Caller** | The mentor named in the plan |
| **Auth checked** | `plan.mentor.require_auth()` |
| **Preconditions** | Plan exists; plan is `AwaitingMentor`; current ledger ≤ `deadline_ledger` |
| **Effect** | Plan transitions to `Active`; milestone actions are now enabled |
| **Errors** | `PlanNotFound`, `PlanNotAwaitingMentor`, `DeadlinePassed` |
| **Event** | `(fidara, accepted)` → `plan_id` |

---

## `cancel_plan`

| Field | Value |
|-------|-------|
| **Caller** | The learner named in the plan |
| **Auth checked** | `plan.learner.require_auth()` |
| **Preconditions** | Plan exists; plan is `AwaitingMentor` |
| **Effect** | Plan transitions to `Cancelled`; full stake refunded to learner |
| **Errors** | `PlanNotFound`, `PlanNotAwaitingMentor` |
| **Event** | `(fidara, cancelled)` → `plan_id` |

---

## `submit_milestone`

| Field | Value |
|-------|-------|
| **Caller** | The learner named in the plan |
| **Auth checked** | `plan.learner.require_auth()` |
| **Preconditions** | Plan is `Active`; milestone is `Pending`; current ledger ≤ `deadline_ledger` |
| **Effect** | Milestone transitions to `Submitted`; records submission ledger |
| **Errors** | `PlanNotFound`, `PlanNotActive`, `InvalidMilestoneIndex`, `NotPending`, `DeadlinePassed` |
| **Event** | `(fidara, submitted)` → `(plan_id, index)` |

---

## `verify_milestone`

| Field | Value |
|-------|-------|
| **Caller** | The mentor named in the plan |
| **Auth checked** | `plan.mentor.require_auth()` |
| **Preconditions** | Plan is `Active`; milestone is `Submitted` |
| **Effect** | Milestone transitions to `Verified`; stake share transferred to learner. If all milestones are now terminal, plan transitions to `Completed`. |
| **Errors** | `PlanNotFound`, `PlanNotActive`, `InvalidMilestoneIndex`, `NotSubmitted` |
| **Events** | `(fidara, verified)` → `(plan_id, index, share)`; optionally `(fidara, completed)` → `plan_id` |

---

## `reject_milestone`

| Field | Value |
|-------|-------|
| **Caller** | The mentor named in the plan |
| **Auth checked** | `plan.mentor.require_auth()` |
| **Preconditions** | Plan is `Active`; milestone is `Submitted`; current ledger ≤ `submitted_at + review_window_ledgers` |
| **Effect** | Milestone transitions back to `Pending`; learner may resubmit before the deadline |
| **Errors** | `PlanNotFound`, `PlanNotActive`, `InvalidMilestoneIndex`, `NotSubmitted`, `ReviewWindowClosed` |
| **Event** | `(fidara, rejected)` → `(plan_id, index)` |

---

## `claim_unreviewed`

| Field | Value |
|-------|-------|
| **Caller** | Anyone (no auth required) |
| **Auth checked** | None |
| **Preconditions** | Plan is `Active`; milestone is `Submitted`; current ledger > `submitted_at + review_window_ledgers` |
| **Effect** | Milestone transitions to `Verified`; stake share transferred to learner. Prevents a silent mentor from trapping stake. If all milestones are now terminal, plan transitions to `Completed`. |
| **Errors** | `PlanNotFound`, `PlanNotActive`, `InvalidMilestoneIndex`, `NotSubmitted`, `ReviewWindowOpen` |
| **Events** | `(fidara, released)` → `(plan_id, index)`; optionally `(fidara, completed)` → `plan_id` |

---

## `forfeit_milestone`

| Field | Value |
|-------|-------|
| **Caller** | Anyone (no auth required) |
| **Auth checked** | None |
| **Preconditions** | Plan is `Active`; milestone is `Pending`; current ledger > `deadline_ledger` |
| **Effect** | Milestone transitions to `Forfeited`; stake share transferred to `forfeit_recipient`. If all milestones are now terminal, plan transitions to `Completed`. |
| **Errors** | `PlanNotFound`, `PlanNotActive`, `InvalidMilestoneIndex`, `NotPending`, `DeadlineNotPassed` |
| **Events** | `(fidara, forfeited)` → `(plan_id, index, share)`; optionally `(fidara, completed)` → `plan_id` |

---

## `extend_plan`

| Field | Value |
|-------|-------|
| **Caller** | Anyone (no auth required) |
| **Auth checked** | None |
| **Preconditions** | Plan exists (any status) |
| **Effect** | Bumps the TTL of the plan's persistent storage entry and the contract instance |
| **Errors** | `PlanNotFound` |
| **Event** | `(fidara, extended)` → `plan_id` |

---

## `get_plan`

| Field | Value |
|-------|-------|
| **Caller** | Anyone (read-only) |
| **Auth checked** | None |
| **Preconditions** | Plan exists (any status) |
| **Effect** | Returns the full `Plan` struct; no state change |
| **Errors** | `PlanNotFound` |
| **Event** | None |

---

## Error code reference

| Code | Name | Meaning |
|------|------|---------|
| 1 | `InvalidMilestoneCount` | `milestone_count` outside [1, 12] |
| 2 | `LearnerIsMentor` | `learner == mentor` |
| 3 | `MentorIsForfeitRecipient` | `mentor == forfeit_recipient` |
| 4 | `PlanNotFound` | Plan ID does not exist |
| 5 | `InvalidMilestoneIndex` | Index out of range |
| 6 | `PlanNotActive` | Milestone action on non-Active plan |
| 7 | `NotLearner` | (reserved) |
| 8 | `NotMentor` | (reserved) |
| 9 | `NotPending` | Milestone is not in Pending state |
| 10 | `NotSubmitted` | Milestone is not in Submitted state |
| 11 | `DeadlinePassed` | Current ledger > deadline |
| 12 | `ReviewWindowOpen` | Review window has not yet elapsed |
| 13 | `DeadlineNotPassed` | Deadline has not passed yet |
| 14 | `ReviewWindowClosed` | Review window has already elapsed |
| 15 | `InvalidStakeAmount` | `stake_amount` ≤ 0 |
| 16 | `InvalidDeadline` | Deadline ≤ current + review window |
| 17 | `ReviewWindowTooShort` | Below MIN_REVIEW_WINDOW_LEDGERS |
| 18 | `PlanNotAwaitingMentor` | accept/cancel on non-AwaitingMentor plan |
