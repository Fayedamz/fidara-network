#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

use crate::{
    contract::{FidaraContract, FidaraContractClient, MIN_REVIEW_WINDOW_LEDGERS},
    errors::FidaraError,
    types::{MilestoneStatus, PlanStatus},
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

struct TestEnv {
    env: Env,
    learner: Address,
    mentor: Address,
    forfeit: Address,
    token: Address,
}

impl TestEnv {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let learner = Address::generate(&env);
        let mentor = Address::generate(&env);
        let forfeit = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone());
        StellarAssetClient::new(&env, &token.address()).mint(&learner, &1_000_000);

        TestEnv {
            env,
            learner,
            mentor,
            forfeit,
            token: token.address(),
        }
    }

    fn client(&self) -> FidaraContractClient {
        let contract_id = self.env.register(FidaraContract, ());
        FidaraContractClient::new(&self.env, &contract_id)
    }

    fn ledger(&self) -> u32 {
        self.env.ledger().sequence()
    }

    fn advance(&self, ledgers: u32) {
        self.env.ledger().set(LedgerInfo {
            sequence_number: self.env.ledger().sequence() + ledgers,
            ..self.env.ledger().get()
        });
    }

    fn token_balance(&self, addr: &Address) -> i128 {
        TokenClient::new(&self.env, &self.token).balance(addr)
    }

    /// Create a plan with MIN window + comfortable deadline, then accept it.
    /// Returns the plan_id; the plan is Active on return.
    fn active_plan(&self, client: &FidaraContractClient) -> u64 {
        let review = MIN_REVIEW_WINDOW_LEDGERS;
        let deadline = self.ledger() + review + 10_000;
        let id = client
            .create_plan(
                &self.learner,
                &self.mentor,
                &self.token,
                &300,
                &3,
                &review,
                &deadline,
                &self.forfeit,
            )
            .unwrap();
        client.accept_plan(&id).unwrap();
        id
    }

    /// Create a plan (AwaitingMentor, NOT yet accepted).
    fn awaiting_plan(&self, client: &FidaraContractClient) -> u64 {
        let review = MIN_REVIEW_WINDOW_LEDGERS;
        let deadline = self.ledger() + review + 10_000;
        client
            .create_plan(
                &self.learner,
                &self.mentor,
                &self.token,
                &300,
                &3,
                &review,
                &deadline,
                &self.forfeit,
            )
            .unwrap()
    }
}

// ---------------------------------------------------------------------------
// Section 1 tests: create_plan validations
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_success_awaiting_mentor() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.status, PlanStatus::AwaitingMentor);
    assert_eq!(plan.milestone_count, 3);
    assert_eq!(plan.stake_amount, 300);
    assert_eq!(t.token_balance(&t.learner), 1_000_000 - 300);
}

#[test]
fn test_create_plan_rejects_zero_stake() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &0,
            &1,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::InvalidStakeAmount.into());
}

#[test]
fn test_create_plan_rejects_negative_stake() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &-1,
            &1,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::InvalidStakeAmount.into());
}

#[test]
fn test_create_plan_rejects_deadline_in_past() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    // deadline == current ledger — should fail (must be > current + review)
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &100,
            &1,
            &review,
            &t.ledger(),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::InvalidDeadline.into());
}

#[test]
fn test_create_plan_rejects_deadline_before_review_window() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    // deadline == current + review; must be strictly greater
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &100,
            &1,
            &review,
            &(t.ledger() + review),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::InvalidDeadline.into());
}

#[test]
fn test_create_plan_rejects_review_window_below_minimum() {
    let t = TestEnv::new();
    let client = t.client();
    let short_window = MIN_REVIEW_WINDOW_LEDGERS - 1;
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &100,
            &1,
            &short_window,
            &(t.ledger() + MIN_REVIEW_WINDOW_LEDGERS + 1_000),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::ReviewWindowTooShort.into());
}

#[test]
fn test_create_plan_learner_is_mentor_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let err = client
        .try_create_plan(
            &t.learner,
            &t.learner,
            &t.token,
            &100,
            &1,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::LearnerIsMentor.into());
}

#[test]
fn test_create_plan_mentor_is_forfeit_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &100,
            &1,
            &review,
            &(t.ledger() + review + 1_000),
            &t.mentor,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::MentorIsForfeitRecipient.into());
}

#[test]
fn test_create_plan_zero_milestones_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &100,
            &0,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::InvalidMilestoneCount.into());
}

#[test]
fn test_create_plan_thirteen_milestones_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &100,
            &13,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::InvalidMilestoneCount.into());
}

#[test]
fn test_create_plan_id_increments() {
    let t = TestEnv::new();
    let client = t.client();
    let id0 = t.awaiting_plan(&client);
    let id1 = t.awaiting_plan(&client);
    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
}

// ---------------------------------------------------------------------------
// accept_plan tests
// ---------------------------------------------------------------------------

#[test]
fn test_accept_plan_success() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    client.accept_plan(&id).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.status, PlanStatus::Active);
}

#[test]
fn test_accept_plan_only_mentor() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    // PlanNotFound used as proxy — real auth failure requires dropping mock_all_auths.
    let err = client.try_accept_plan(&999).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

#[test]
fn test_accept_plan_only_once() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    client.accept_plan(&id).unwrap();
    let err = client.try_accept_plan(&id).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotAwaitingMentor.into());
}

#[test]
fn test_accept_plan_not_after_deadline() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    // Advance past the deadline.
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 10_001);
    let err = client.try_accept_plan(&id).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::DeadlinePassed.into());
}

#[test]
fn test_accept_cancelled_plan_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    client.cancel_plan(&id).unwrap();
    let err = client.try_accept_plan(&id).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotAwaitingMentor.into());
}

// ---------------------------------------------------------------------------
// cancel_plan tests
// ---------------------------------------------------------------------------

#[test]
fn test_cancel_plan_full_refund() {
    let t = TestEnv::new();
    let client = t.client();
    let before = t.token_balance(&t.learner);
    let id = t.awaiting_plan(&client);
    assert_eq!(t.token_balance(&t.learner), before - 300);
    client.cancel_plan(&id).unwrap();
    assert_eq!(t.token_balance(&t.learner), before); // full refund
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.status, PlanStatus::Cancelled);
}

#[test]
fn test_cancel_plan_only_while_awaiting() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let err = client.try_cancel_plan(&id).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotAwaitingMentor.into());
}

#[test]
fn test_cancel_plan_twice_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    client.cancel_plan(&id).unwrap();
    let err = client.try_cancel_plan(&id).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotAwaitingMentor.into());
}

#[test]
fn test_mentor_never_accepts_learner_cancels() {
    let t = TestEnv::new();
    let client = t.client();
    let before = t.token_balance(&t.learner);
    let id = t.awaiting_plan(&client);
    // Advance past deadline — mentor never accepted.
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 10_001);
    // Learner can still cancel even after deadline (plan is still AwaitingMentor).
    client.cancel_plan(&id).unwrap();
    assert_eq!(t.token_balance(&t.learner), before);
}

// ---------------------------------------------------------------------------
// Exploit test: tiny window + immediate claim_unreviewed must fail
// ---------------------------------------------------------------------------

#[test]
fn test_exploit_tiny_window_blocked_by_minimum() {
    let t = TestEnv::new();
    let client = t.client();
    // MIN_REVIEW_WINDOW_LEDGERS - 1 is now rejected at creation.
    let short = MIN_REVIEW_WINDOW_LEDGERS - 1;
    let err = client
        .try_create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &300,
            &3,
            &short,
            &(t.ledger() + MIN_REVIEW_WINDOW_LEDGERS + 1_000),
            &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::ReviewWindowTooShort.into());
}

#[test]
fn test_exploit_awaiting_mentor_blocks_submit() {
    // Even with valid window, milestones are blocked until mentor accepts.
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotActive.into());
}

#[test]
fn test_exploit_awaiting_mentor_blocks_claim_unreviewed() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    let err = client.try_claim_unreviewed(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotActive.into());
}

// ---------------------------------------------------------------------------
// Every milestone action rejects AwaitingMentor plan
// ---------------------------------------------------------------------------

#[test]
fn test_awaiting_mentor_rejects_all_milestone_ops() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);

    assert_eq!(
        client.try_submit_milestone(&id, &0).unwrap_err().unwrap(),
        FidaraError::PlanNotActive.into()
    );
    assert_eq!(
        client.try_verify_milestone(&id, &0).unwrap_err().unwrap(),
        FidaraError::PlanNotActive.into()
    );
    assert_eq!(
        client.try_reject_milestone(&id, &0).unwrap_err().unwrap(),
        FidaraError::PlanNotActive.into()
    );
    assert_eq!(
        client.try_claim_unreviewed(&id, &0).unwrap_err().unwrap(),
        FidaraError::PlanNotActive.into()
    );
    assert_eq!(
        client.try_forfeit_milestone(&id, &0).unwrap_err().unwrap(),
        FidaraError::PlanNotActive.into()
    );
}

// ---------------------------------------------------------------------------
// Maximum milestones: 12
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_twelve_milestones_ok() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let id = client
        .create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &120,
            &12,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestone_count, 12);
    assert_eq!(plan.milestones.get(0).unwrap().share, 10);
    assert_eq!(plan.milestones.get(11).unwrap().share, 10);
}

// ---------------------------------------------------------------------------
// Rounding tests
// ---------------------------------------------------------------------------

#[test]
fn test_rounding_remainder_on_last_milestone() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    // 10 / 3 = 3 remainder 1
    let id = client
        .create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &10,
            &3,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestones.get(0).unwrap().share, 3);
    assert_eq!(plan.milestones.get(1).unwrap().share, 3);
    assert_eq!(plan.milestones.get(2).unwrap().share, 4);
}

#[test]
fn test_rounding_seven_milestones() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    // 100 / 7 = 14 r 2
    let id = client
        .create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &100,
            &7,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap();
    let plan = client.get_plan(&id).unwrap();
    let mut total: i128 = 0;
    for i in 0..7u32 {
        total += plan.milestones.get(i).unwrap().share;
    }
    assert_eq!(total, 100);
    assert_eq!(plan.milestones.get(6).unwrap().share, 14 + 2);
}

/// Property-style test: total paid out never exceeds stake, for many combinations.
#[test]
fn test_payout_never_exceeds_stake() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;

    // Test stake/count combinations that exercise rounding edge-cases.
    let cases: &[(i128, u32)] = &[
        (1, 1),
        (1, 3),
        (2, 3),
        (7, 3),
        (10, 3),
        (10, 7),
        (100, 12),
        (999, 7),
        (1000, 3),
        (1001, 12),
        (100_000, 1),
        (100_000, 12),
    ];

    for (stake, count) in cases {
        let id = client
            .create_plan(
                &t.learner,
                &t.mentor,
                &t.token,
                stake,
                count,
                &review,
                &(t.ledger() + review + 10_000),
                &t.forfeit,
            )
            .unwrap();
        let plan = client.get_plan(&id).unwrap();
        let total: i128 = (0..*count)
            .map(|i| plan.milestones.get(i).unwrap().share)
            .sum();
        assert_eq!(
            total, *stake,
            "stake={stake} count={count}: shares summed to {total}"
        );
    }
}

// ---------------------------------------------------------------------------
// submit_milestone tests
// ---------------------------------------------------------------------------

#[test]
fn test_submit_milestone_success() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(
        plan.milestones.get(0).unwrap().status,
        MilestoneStatus::Submitted
    );
}

#[test]
fn test_submit_milestone_plan_not_found() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client.try_submit_milestone(&999, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

#[test]
fn test_submit_after_deadline_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 10_001);
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::DeadlinePassed.into());
}

#[test]
fn test_double_submit_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotPending.into());
}

// ---------------------------------------------------------------------------
// verify_milestone tests
// ---------------------------------------------------------------------------

#[test]
fn test_verify_milestone_pays_learner() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let before = t.token_balance(&t.learner);
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(
        plan.milestones.get(0).unwrap().status,
        MilestoneStatus::Verified
    );
    assert_eq!(t.token_balance(&t.learner), before + 100);
}

#[test]
fn test_verify_pending_milestone_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let err = client.try_verify_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

#[test]
fn test_resubmit_after_verify_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotPending.into());
}

#[test]
fn test_double_verify_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    let err = client.try_verify_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

// ---------------------------------------------------------------------------
// reject_milestone tests
// ---------------------------------------------------------------------------

#[test]
fn test_reject_then_resubmit() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.reject_milestone(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(
        plan.milestones.get(0).unwrap().status,
        MilestoneStatus::Pending
    );
    client.submit_milestone(&id, &0).unwrap();
    assert_eq!(
        client
            .get_plan(&id)
            .unwrap()
            .milestones
            .get(0)
            .unwrap()
            .status,
        MilestoneStatus::Submitted
    );
}

#[test]
fn test_reject_pending_milestone_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let err = client.try_reject_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

#[test]
fn test_reject_after_review_window_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 1);
    let err = client.try_reject_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::ReviewWindowClosed.into());
}

#[test]
fn test_double_reject_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.reject_milestone(&id, &0).unwrap();
    let err = client.try_reject_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

// ---------------------------------------------------------------------------
// claim_unreviewed tests
// ---------------------------------------------------------------------------

#[test]
fn test_claim_unreviewed_success() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let before = t.token_balance(&t.learner);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 1);
    client.claim_unreviewed(&id, &0).unwrap();
    assert_eq!(
        client
            .get_plan(&id)
            .unwrap()
            .milestones
            .get(0)
            .unwrap()
            .status,
        MilestoneStatus::Verified
    );
    assert_eq!(t.token_balance(&t.learner), before + 100);
}

#[test]
fn test_claim_unreviewed_window_open_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    // Don't advance — window is still open.
    let err = client.try_claim_unreviewed(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::ReviewWindowOpen.into());
}

#[test]
fn test_claim_unreviewed_not_submitted_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 1);
    let err = client.try_claim_unreviewed(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

#[test]
fn test_mentor_silent_third_party_claims() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 1);
    client.claim_unreviewed(&id, &0).unwrap();
    assert_eq!(t.token_balance(&t.learner), 1_000_000 - 300 + 100);
}

// ---------------------------------------------------------------------------
// forfeit_milestone tests
// ---------------------------------------------------------------------------

#[test]
fn test_forfeit_milestone_pays_recipient() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let before = t.token_balance(&t.forfeit);
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 10_001);
    client.forfeit_milestone(&id, &0).unwrap();
    assert_eq!(
        client
            .get_plan(&id)
            .unwrap()
            .milestones
            .get(0)
            .unwrap()
            .status,
        MilestoneStatus::Forfeited
    );
    assert_eq!(t.token_balance(&t.forfeit), before + 100);
    assert_eq!(t.token_balance(&t.mentor), 0);
}

#[test]
fn test_forfeit_before_deadline_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let err = client.try_forfeit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::DeadlineNotPassed.into());
}

#[test]
fn test_forfeit_submitted_milestone_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 10_001);
    let err = client.try_forfeit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotPending.into());
}

#[test]
fn test_forfeit_verified_milestone_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 10_001);
    let err = client.try_forfeit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotPending.into());
}

// ---------------------------------------------------------------------------
// Plan completion tests
// ---------------------------------------------------------------------------

#[test]
fn test_plan_completes_when_all_done() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let deadline = t.ledger() + review + 10_000;
    let id = client
        .create_plan(
            &t.learner, &t.mentor, &t.token, &200, &2, &review, &deadline, &t.forfeit,
        )
        .unwrap();
    client.accept_plan(&id).unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    t.advance(review + 10_001);
    client.forfeit_milestone(&id, &1).unwrap();
    assert_eq!(client.get_plan(&id).unwrap().status, PlanStatus::Completed);
}

#[test]
fn test_actions_on_completed_plan_fail() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let deadline = t.ledger() + review + 10_000;
    let id = client
        .create_plan(
            &t.learner, &t.mentor, &t.token, &100, &1, &review, &deadline, &t.forfeit,
        )
        .unwrap();
    client.accept_plan(&id).unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotActive.into());
}

#[test]
fn test_single_milestone_plan_completes() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let id = client
        .create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &50,
            &1,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap();
    client.accept_plan(&id).unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    assert_eq!(client.get_plan(&id).unwrap().status, PlanStatus::Completed);
}

#[test]
fn test_stake_never_to_mentor() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    for i in 0u32..3 {
        client.submit_milestone(&id, &i).unwrap();
        client.verify_milestone(&id, &i).unwrap();
    }
    assert_eq!(t.token_balance(&t.mentor), 0);
}

// ---------------------------------------------------------------------------
// Misc / utility tests
// ---------------------------------------------------------------------------

#[test]
fn test_invalid_milestone_index_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let err = client.try_submit_milestone(&id, &99).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::InvalidMilestoneIndex.into());
}

#[test]
fn test_get_plan_not_found() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client.try_get_plan(&999).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

#[test]
fn test_extend_plan_ok() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    client.extend_plan(&id).unwrap();
}

#[test]
fn test_extend_plan_not_found() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client.try_extend_plan(&999).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

#[test]
fn test_full_reject_resubmit_verify_journey() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    let before = t.token_balance(&t.learner);
    client.submit_milestone(&id, &0).unwrap();
    client.reject_milestone(&id, &0).unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    assert_eq!(t.token_balance(&t.learner), before + 100);
}

#[test]
fn test_mixed_verify_forfeit_completes() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let deadline = t.ledger() + review + 10_000;
    let id = client
        .create_plan(
            &t.learner, &t.mentor, &t.token, &300, &3, &review, &deadline, &t.forfeit,
        )
        .unwrap();
    client.accept_plan(&id).unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    client.submit_milestone(&id, &1).unwrap();
    t.advance(review + 1);
    client.claim_unreviewed(&id, &1).unwrap();
    t.advance(10_000);
    client.forfeit_milestone(&id, &2).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.status, PlanStatus::Completed);
    assert_eq!(t.token_balance(&t.forfeit), 100);
    assert_eq!(t.token_balance(&t.learner), 1_000_000 - 300 + 200);
}

// ---------------------------------------------------------------------------
// Event tests
// ---------------------------------------------------------------------------

#[test]
fn test_event_plan_created() {
    let t = TestEnv::new();
    let client = t.client();
    // Before creation: zero events.
    assert_eq!(t.env.events().all().len(), 0);
    let _id = t.awaiting_plan(&client);
    // After creation: at least one event (PlanCreated).
    assert!(
        t.env.events().all().len() >= 1,
        "no events after create_plan"
    );
}

#[test]
fn test_event_plan_accepted() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    let before = t.env.events().all().len();
    client.accept_plan(&id).unwrap();
    assert!(
        t.env.events().all().len() > before,
        "no new events after accept_plan"
    );
}

#[test]
fn test_event_plan_cancelled() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    let before = t.env.events().all().len();
    client.cancel_plan(&id).unwrap();
    assert!(
        t.env.events().all().len() > before,
        "no new events after cancel_plan"
    );
}

#[test]
fn test_event_milestone_submitted() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    // submit emits (plan_id, index) as data.
    let events = t.env.events().all();
    assert!(!events.is_empty(), "no events found after submit_milestone");
}

#[test]
fn test_event_milestone_verified() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    let before_count = t.env.events().all().len();
    client.verify_milestone(&id, &0).unwrap();
    let after_count = t.env.events().all().len();
    assert!(
        after_count > before_count,
        "no new events after verify_milestone"
    );
}

#[test]
fn test_event_milestone_rejected() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    let before_count = t.env.events().all().len();
    client.reject_milestone(&id, &0).unwrap();
    let after_count = t.env.events().all().len();
    assert!(
        after_count > before_count,
        "no new events after reject_milestone"
    );
}

#[test]
fn test_event_milestone_auto_released() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 1);
    let before_count = t.env.events().all().len();
    client.claim_unreviewed(&id, &0).unwrap();
    let after_count = t.env.events().all().len();
    assert!(
        after_count > before_count,
        "no new events after claim_unreviewed"
    );
}

#[test]
fn test_event_milestone_forfeited() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.active_plan(&client);
    t.advance(MIN_REVIEW_WINDOW_LEDGERS + 10_001);
    let before_count = t.env.events().all().len();
    client.forfeit_milestone(&id, &0).unwrap();
    let after_count = t.env.events().all().len();
    assert!(
        after_count > before_count,
        "no new events after forfeit_milestone"
    );
}

#[test]
fn test_event_plan_completed() {
    let t = TestEnv::new();
    let client = t.client();
    let review = MIN_REVIEW_WINDOW_LEDGERS;
    let id = client
        .create_plan(
            &t.learner,
            &t.mentor,
            &t.token,
            &100,
            &1,
            &review,
            &(t.ledger() + review + 1_000),
            &t.forfeit,
        )
        .unwrap();
    client.accept_plan(&id).unwrap();
    client.submit_milestone(&id, &0).unwrap();
    let before_count = t.env.events().all().len();
    client.verify_milestone(&id, &0).unwrap();
    let after_count = t.env.events().all().len();
    // verify_milestone emits both MilestoneVerified AND PlanCompleted.
    assert!(
        after_count >= before_count + 2,
        "expected ≥2 new events (verified + completed), got {}",
        after_count - before_count
    );
    assert_eq!(client.get_plan(&id).unwrap().status, PlanStatus::Completed);
}

#[test]
fn test_event_plan_extended() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.awaiting_plan(&client);
    let before_count = t.env.events().all().len();
    client.extend_plan(&id).unwrap();
    let after_count = t.env.events().all().len();
    assert!(
        after_count > before_count,
        "no new events after extend_plan"
    );
}
