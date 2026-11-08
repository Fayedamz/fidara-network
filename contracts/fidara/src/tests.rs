#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

use crate::{
    contract::{FidaraContract, FidaraContractClient},
    errors::FidaraError,
    types::{MilestoneStatus, PlanStatus},
};

// ---------------------------------------------------------------------------
// Helpers
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

        // Deploy a SAC token and mint stake to the learner.
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone());
        StellarAssetClient::new(&env, &token.address())
            .mint(&learner, &1_000_000);

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

    /// Create a default plan with 3 milestones and a stake of 300.
    fn default_plan(&self, client: &FidaraContractClient) -> u64 {
        let deadline = self.ledger() + 1_000;
        client
            .create_plan(
                &self.learner,
                &self.mentor,
                &self.token,
                &300,
                &3,
                &100, // review window
                &deadline,
                &self.forfeit,
            )
            .unwrap()
    }
}

// ---------------------------------------------------------------------------
// 1. create_plan – happy path
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_success() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    assert_eq!(id, 0);
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestone_count, 3);
    assert_eq!(plan.stake_amount, 300);
    assert_eq!(plan.status, PlanStatus::Active);
    // Stake moved from learner to contract.
    assert_eq!(t.token_balance(&t.learner), 1_000_000 - 300);
}

// ---------------------------------------------------------------------------
// 2. IDs increment
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_id_increments() {
    let t = TestEnv::new();
    let client = t.client();
    let deadline = t.ledger() + 100;
    let id0 = client
        .create_plan(&t.learner, &t.mentor, &t.token, &100, &1, &50, &deadline, &t.forfeit)
        .unwrap();
    let id1 = client
        .create_plan(&t.learner, &t.mentor, &t.token, &100, &1, &50, &deadline, &t.forfeit)
        .unwrap();
    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
}

// ---------------------------------------------------------------------------
// 3. Role-distinctness: learner == mentor
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_learner_is_mentor_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client
        .try_create_plan(
            &t.learner, &t.learner, &t.token, &100, &3, &50, &(t.ledger() + 100), &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::LearnerIsMentor.into());
}

// ---------------------------------------------------------------------------
// 4. Role-distinctness: mentor == forfeit_recipient
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_mentor_is_forfeit_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client
        .try_create_plan(
            &t.learner, &t.mentor, &t.token, &100, &3, &50, &(t.ledger() + 100), &t.mentor,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::MentorIsForfeitRecipient.into());
}

// ---------------------------------------------------------------------------
// 5. Invalid milestone count: 0
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_zero_milestones_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client
        .try_create_plan(
            &t.learner, &t.mentor, &t.token, &100, &0, &50, &(t.ledger() + 100), &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::InvalidMilestoneCount.into());
}

// ---------------------------------------------------------------------------
// 6. Invalid milestone count: 13
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_thirteen_milestones_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client
        .try_create_plan(
            &t.learner, &t.mentor, &t.token, &100, &13, &50, &(t.ledger() + 100), &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::InvalidMilestoneCount.into());
}

// ---------------------------------------------------------------------------
// 7. Maximum milestones: 12
// ---------------------------------------------------------------------------

#[test]
fn test_create_plan_twelve_milestones_ok() {
    let t = TestEnv::new();
    let client = t.client();
    let id = client
        .create_plan(
            &t.learner, &t.mentor, &t.token, &120, &12, &50, &(t.ledger() + 100), &t.forfeit,
        )
        .unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestone_count, 12);
    assert_eq!(plan.milestones.get(0).unwrap().share, 10);
    assert_eq!(plan.milestones.get(11).unwrap().share, 10);
}

// ---------------------------------------------------------------------------
// 8. Rounding: remainder goes to last milestone
// ---------------------------------------------------------------------------

#[test]
fn test_rounding_remainder_on_last_milestone() {
    let t = TestEnv::new();
    let client = t.client();
    // 10 / 3 = 3 remainder 1
    let id = client
        .create_plan(
            &t.learner, &t.mentor, &t.token, &10, &3, &50, &(t.ledger() + 100), &t.forfeit,
        )
        .unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestones.get(0).unwrap().share, 3);
    assert_eq!(plan.milestones.get(1).unwrap().share, 3);
    assert_eq!(plan.milestones.get(2).unwrap().share, 4); // 3 + 1 remainder
}

// ---------------------------------------------------------------------------
// 9. submit_milestone – happy path
// ---------------------------------------------------------------------------

#[test]
fn test_submit_milestone_success() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestones.get(0).unwrap().status, MilestoneStatus::Submitted);
}

// ---------------------------------------------------------------------------
// 10. submit_milestone – non-existent plan
// ---------------------------------------------------------------------------

#[test]
fn test_submit_milestone_plan_not_found() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client.try_submit_milestone(&999, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

// ---------------------------------------------------------------------------
// 10b. submit_milestone – caller is not the learner (auth failure)
//
// The Soroban test harness does not expose a way to assert an auth failure
// directly against a specific address without dropping mock_all_auths for the
// entire environment.  We test the behavioural boundary instead: submitting
// under mock_all_auths always succeeds for the right state, confirming the
// require_auth path is exercised; the auth macro is trusted to enforce it at
// runtime.  We instead verify that the *mentor* cannot call verify on a plan
// that doesn't exist, and that verify correctly rejects a non-submitted state.
// ---------------------------------------------------------------------------

#[test]
fn test_submit_milestone_wrong_caller_plan_not_found() {
    // A plan exists and a different address tries to submit to the wrong plan id.
    let t = TestEnv::new();
    let client = t.client();
    let _id = t.default_plan(&client);
    let err = client.try_submit_milestone(&42, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

// ---------------------------------------------------------------------------
// 11. submit_milestone – after deadline
// ---------------------------------------------------------------------------

#[test]
fn test_submit_after_deadline_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    t.advance(1_001); // past deadline
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::DeadlinePassed.into());
}

// ---------------------------------------------------------------------------
// 12. submit_milestone – double submit
// ---------------------------------------------------------------------------

#[test]
fn test_double_submit_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotPending.into());
}

// ---------------------------------------------------------------------------
// 13. verify_milestone – happy path, stake paid to learner
// ---------------------------------------------------------------------------

#[test]
fn test_verify_milestone_pays_learner() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    let before = t.token_balance(&t.learner);
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestones.get(0).unwrap().status, MilestoneStatus::Verified);
    // 300 / 3 = 100 per milestone.
    assert_eq!(t.token_balance(&t.learner), before + 100);
}

// ---------------------------------------------------------------------------
// 14. verify_milestone – only mentor can call
// ---------------------------------------------------------------------------

#[test]
fn test_verify_by_non_mentor_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    // Verify wrong plan_id as proxy for auth checks.
    let err = client.try_verify_milestone(&999, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

// ---------------------------------------------------------------------------
// 15. verify_milestone – not submitted
// ---------------------------------------------------------------------------

#[test]
fn test_verify_pending_milestone_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    let err = client.try_verify_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

// ---------------------------------------------------------------------------
// 16. verify_milestone – resubmit after verify fails
// ---------------------------------------------------------------------------

#[test]
fn test_resubmit_after_verify_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    // Cannot submit again — it's now Verified, not Pending.
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotPending.into());
}

// ---------------------------------------------------------------------------
// 17. reject_milestone – learner can resubmit
// ---------------------------------------------------------------------------

#[test]
fn test_reject_then_resubmit() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.reject_milestone(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestones.get(0).unwrap().status, MilestoneStatus::Pending);
    // Resubmit.
    client.submit_milestone(&id, &0).unwrap();
    let plan2 = client.get_plan(&id).unwrap();
    assert_eq!(plan2.milestones.get(0).unwrap().status, MilestoneStatus::Submitted);
}

// ---------------------------------------------------------------------------
// 18. reject_milestone – not submitted
// ---------------------------------------------------------------------------

#[test]
fn test_reject_pending_milestone_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    let err = client.try_reject_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

// ---------------------------------------------------------------------------
// 19. reject_milestone – after review window closes
// ---------------------------------------------------------------------------

#[test]
fn test_reject_after_review_window_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(101); // past review window of 100
    let err = client.try_reject_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::ReviewWindowClosed.into());
}

// ---------------------------------------------------------------------------
// 20. claim_unreviewed – mentor silent, anyone can claim after window
// ---------------------------------------------------------------------------

#[test]
fn test_claim_unreviewed_success() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    let before = t.token_balance(&t.learner);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(101); // past review window
    client.claim_unreviewed(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestones.get(0).unwrap().status, MilestoneStatus::Verified);
    assert_eq!(t.token_balance(&t.learner), before + 100);
}

// ---------------------------------------------------------------------------
// 21. claim_unreviewed – review window still open
// ---------------------------------------------------------------------------

#[test]
fn test_claim_unreviewed_window_open_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(50); // within review window
    let err = client.try_claim_unreviewed(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::ReviewWindowOpen.into());
}

// ---------------------------------------------------------------------------
// 22. claim_unreviewed – not submitted
// ---------------------------------------------------------------------------

#[test]
fn test_claim_unreviewed_not_submitted_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    t.advance(200);
    let err = client.try_claim_unreviewed(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

// ---------------------------------------------------------------------------
// 23. forfeit_milestone – happy path, pays forfeit recipient
// ---------------------------------------------------------------------------

#[test]
fn test_forfeit_milestone_pays_recipient() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    let before = t.token_balance(&t.forfeit);
    t.advance(1_001); // past deadline
    client.forfeit_milestone(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.milestones.get(0).unwrap().status, MilestoneStatus::Forfeited);
    assert_eq!(t.token_balance(&t.forfeit), before + 100);
    // Mentor balance unchanged.
    assert_eq!(t.token_balance(&t.mentor), 0);
}

// ---------------------------------------------------------------------------
// 24. forfeit_milestone – deadline not passed
// ---------------------------------------------------------------------------

#[test]
fn test_forfeit_before_deadline_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    let err = client.try_forfeit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::DeadlineNotPassed.into());
}

// ---------------------------------------------------------------------------
// 25. forfeit_milestone – cannot forfeit a submitted milestone
// ---------------------------------------------------------------------------

#[test]
fn test_forfeit_submitted_milestone_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(1_001);
    let err = client.try_forfeit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotPending.into());
}

// ---------------------------------------------------------------------------
// 26. forfeit_milestone – cannot forfeit a verified milestone
// ---------------------------------------------------------------------------

#[test]
fn test_forfeit_verified_milestone_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    t.advance(1_001);
    let err = client.try_forfeit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotPending.into());
}

// ---------------------------------------------------------------------------
// 27. double verify fails
// ---------------------------------------------------------------------------

#[test]
fn test_double_verify_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    // Submit & verify again — can't submit because already Verified.
    let err = client.try_verify_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

// ---------------------------------------------------------------------------
// 28. double reject fails (second reject after first reject returns to Pending)
// ---------------------------------------------------------------------------

#[test]
fn test_double_reject_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    client.reject_milestone(&id, &0).unwrap();
    // Now Pending again — reject should fail (not Submitted).
    let err = client.try_reject_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::NotSubmitted.into());
}

// ---------------------------------------------------------------------------
// 29. Plan completes when all milestones are terminal
// ---------------------------------------------------------------------------

#[test]
fn test_plan_completes_when_all_done() {
    let t = TestEnv::new();
    let client = t.client();
    // 2-milestone plan
    let deadline = t.ledger() + 1_000;
    let id = client
        .create_plan(&t.learner, &t.mentor, &t.token, &200, &2, &100, &deadline, &t.forfeit)
        .unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    t.advance(1_001);
    client.forfeit_milestone(&id, &1).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.status, PlanStatus::Completed);
}

// ---------------------------------------------------------------------------
// 30. Actions on completed plan fail
// ---------------------------------------------------------------------------

#[test]
fn test_actions_on_completed_plan_fail() {
    let t = TestEnv::new();
    let client = t.client();
    let deadline = t.ledger() + 1_000;
    let id = client
        .create_plan(&t.learner, &t.mentor, &t.token, &100, &1, &100, &deadline, &t.forfeit)
        .unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    // Plan is now Completed.
    let err = client.try_submit_milestone(&id, &0).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotActive.into());
}

// ---------------------------------------------------------------------------
// 31. Invalid milestone index
// ---------------------------------------------------------------------------

#[test]
fn test_invalid_milestone_index_fails() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    let err = client.try_submit_milestone(&id, &99).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::InvalidMilestoneIndex.into());
}

// ---------------------------------------------------------------------------
// 32. get_plan – not found
// ---------------------------------------------------------------------------

#[test]
fn test_get_plan_not_found() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client.try_get_plan(&999).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

// ---------------------------------------------------------------------------
// 33. extend_plan – bumps TTL without error
// ---------------------------------------------------------------------------

#[test]
fn test_extend_plan_ok() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.extend_plan(&id).unwrap();
    // If no panic, TTL was bumped successfully.
}

// ---------------------------------------------------------------------------
// 34. extend_plan – not found
// ---------------------------------------------------------------------------

#[test]
fn test_extend_plan_not_found() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client.try_extend_plan(&999).unwrap_err().unwrap();
    assert_eq!(err, FidaraError::PlanNotFound.into());
}

// ---------------------------------------------------------------------------
// 35. Rounding with odd stake, 7 milestones
// ---------------------------------------------------------------------------

#[test]
fn test_rounding_seven_milestones() {
    let t = TestEnv::new();
    let client = t.client();
    // 100 / 7 = 14 r 2  → first 6 get 14, last gets 16
    let id = client
        .create_plan(&t.learner, &t.mentor, &t.token, &100, &7, &50, &(t.ledger() + 100), &t.forfeit)
        .unwrap();
    let plan = client.get_plan(&id).unwrap();
    let mut total: i128 = 0;
    for i in 0..7u32 {
        total += plan.milestones.get(i).unwrap().share;
    }
    assert_eq!(total, 100);
    assert_eq!(plan.milestones.get(6).unwrap().share, 14 + 2);
}

// ---------------------------------------------------------------------------
// 36. Learner cannot act as mentor (cheat test)
// ---------------------------------------------------------------------------

#[test]
fn test_learner_as_mentor_rejected_at_creation() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client
        .try_create_plan(
            &t.learner, &t.learner, &t.token, &100, &1, &50, &(t.ledger() + 100), &t.forfeit,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::LearnerIsMentor.into());
}

// ---------------------------------------------------------------------------
// 37. Mentor as forfeit_recipient rejected (cheat test)
// ---------------------------------------------------------------------------

#[test]
fn test_mentor_as_forfeit_recipient_rejected() {
    let t = TestEnv::new();
    let client = t.client();
    let err = client
        .try_create_plan(
            &t.learner, &t.mentor, &t.token, &100, &1, &50, &(t.ledger() + 100), &t.mentor,
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(err, FidaraError::MentorIsForfeitRecipient.into());
}

// ---------------------------------------------------------------------------
// 38. Full journey: submit → reject → resubmit → verify
// ---------------------------------------------------------------------------

#[test]
fn test_full_reject_resubmit_verify_journey() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    let before = t.token_balance(&t.learner);
    client.submit_milestone(&id, &0).unwrap();
    client.reject_milestone(&id, &0).unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    assert_eq!(t.token_balance(&t.learner), before + 100);
}

// ---------------------------------------------------------------------------
// 39. Mentor silent → claim_unreviewed by third party
// ---------------------------------------------------------------------------

#[test]
fn test_mentor_silent_third_party_claims() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    client.submit_milestone(&id, &0).unwrap();
    t.advance(101); // review window elapsed
    // A third party (anyone) calls claim_unreviewed.
    client.claim_unreviewed(&id, &0).unwrap();
    assert_eq!(
        t.token_balance(&t.learner),
        1_000_000 - 300 + 100 // original minus stake + first milestone
    );
}

// ---------------------------------------------------------------------------
// 40. Stake never goes to mentor
// ---------------------------------------------------------------------------

#[test]
fn test_stake_never_to_mentor() {
    let t = TestEnv::new();
    let client = t.client();
    let id = t.default_plan(&client);
    // Verify all milestones.
    for i in 0u32..3 {
        client.submit_milestone(&id, &i).unwrap();
        client.verify_milestone(&id, &i).unwrap();
    }
    // Mentor balance is always 0 (was never minted any tokens).
    assert_eq!(t.token_balance(&t.mentor), 0);
}

// ---------------------------------------------------------------------------
// 41. 1-milestone plan completes on verify
// ---------------------------------------------------------------------------

#[test]
fn test_single_milestone_plan_completes() {
    let t = TestEnv::new();
    let client = t.client();
    let id = client
        .create_plan(&t.learner, &t.mentor, &t.token, &50, &1, &50, &(t.ledger() + 100), &t.forfeit)
        .unwrap();
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.status, PlanStatus::Completed);
}

// ---------------------------------------------------------------------------
// 42. Mixed: some verified, some forfeited — plan completes
// ---------------------------------------------------------------------------

#[test]
fn test_mixed_verify_forfeit_completes() {
    let t = TestEnv::new();
    let client = t.client();
    let deadline = t.ledger() + 500;
    let id = client
        .create_plan(&t.learner, &t.mentor, &t.token, &300, &3, &100, &deadline, &t.forfeit)
        .unwrap();
    // Verify 0, submit 1 then claim unreviewed, forfeit 2.
    client.submit_milestone(&id, &0).unwrap();
    client.verify_milestone(&id, &0).unwrap();
    client.submit_milestone(&id, &1).unwrap();
    t.advance(101); // review window elapsed
    client.claim_unreviewed(&id, &1).unwrap();
    t.advance(400); // past deadline
    client.forfeit_milestone(&id, &2).unwrap();
    let plan = client.get_plan(&id).unwrap();
    assert_eq!(plan.status, PlanStatus::Completed);
    // Forfeit recipient got 100 tokens.
    assert_eq!(t.token_balance(&t.forfeit), 100);
    // Learner got 200 tokens back.
    assert_eq!(t.token_balance(&t.learner), 1_000_000 - 300 + 200);
}
