use soroban_sdk::{contracttype, Address};

/// Lifecycle of a commitment plan.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum PlanStatus {
    Active,
    Completed,
}

/// Per-milestone state machine.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum MilestoneStatus {
    /// Not yet submitted (initial state, or after a rejection).
    Pending,
    /// Learner submitted; awaiting mentor review.
    Submitted,
    /// Mentor verified — stake share paid to learner.
    Verified,
    /// Past deadline and never submitted — stake share paid to forfeit recipient.
    Forfeited,
}

/// A single milestone within a plan.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Milestone {
    pub status: MilestoneStatus,
    /// Ledger at which the learner submitted (0 when Pending/Forfeited).
    pub submitted_at: u32,
    /// Token amount allocated to this milestone.
    pub share: i128,
}

/// The full commitment plan stored on-ledger.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Plan {
    pub id: u64,
    pub learner: Address,
    pub mentor: Address,
    pub token: Address,
    pub stake_amount: i128,
    pub milestone_count: u32,
    /// Ledger number after which no new submissions are accepted.
    pub deadline_ledger: u32,
    /// How many ledgers the mentor has to review after a submission.
    pub review_window_ledgers: u32,
    pub forfeit_recipient: Address,
    pub status: PlanStatus,
    pub milestones: soroban_sdk::Vec<Milestone>,
}
