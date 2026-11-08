# Fidara Network — Design Decisions

## D-001: Ledger close time and MIN_REVIEW_WINDOW_LEDGERS

**Source:** [Stellar Developer Docs — Ledgers](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers)
and the Stellar homepage: "Ledgers close in ~5 seconds."
Confirmed by the [Stellar Developer Blog](https://www.stellar.org/developers-blog/transaction-submission-timeouts-and-dynamic-fees-faq):
"Ledgers continue to close in about 5 seconds."

**Decision:** One day ≈ 86 400 s ÷ 5 s/ledger = 17 280 ledgers.

`MIN_REVIEW_WINDOW_LEDGERS` is set to **17 280** (one day).

This means a learner cannot set a window so small that they can submit a milestone,
wait one ledger, and immediately call `claim_unreviewed` to recover their stake with no
mentor involvement.

## D-002: AwaitingMentor plan status

**Problem (audit finding a):** The original design let the learner choose the review
window unilaterally, without the mentor ever agreeing to the terms. A learner could set
`review_window_ledgers = 1`, submit every milestone, wait one ledger, and call
`claim_unreviewed` on all of them — recovering the full stake with no mentor involvement.

**Decision:** Plans start in `AwaitingMentor`. Milestone operations (submit, verify,
reject, claim_unreviewed, forfeit) are blocked until the mentor explicitly calls
`accept_plan`, meaning the mentor has seen and agreed to the review window and deadline.
The learner can cancel while awaiting and receive a full refund.

## D-003: Deadline and stake validation

**Problem (audit finding b):** `create_plan` did not validate `stake_amount` or
`deadline_ledger`.

**Decision:**
- `stake_amount` must be > 0.
- `deadline_ledger` must be > `current_ledger + review_window_ledgers`, ensuring the
  learner has at least one full review window before the deadline.

## D-004: Public function count

After adding `accept_plan` and `cancel_plan`, the total count is 10 public functions,
within the ≤12 limit specified.

## D-005: Events

**Source:** [Soroban events example](https://github.com/stellar/soroban-examples/blob/main/events/src/lib.rs)
and [Stellar Docs — Events](https://developers.stellar.org/docs/learn/encyclopedia/contract-development/events).

Events use the `#[contractevent]` macro (Protocol 23 / SDK 22 syntax):
```rust
#[contractevent(topics = ["topic1", "topic2"], data_format = "single-value")]
struct MyEvent { field: Type }
// emit:
MyEvent { field }.publish(&env);
```
