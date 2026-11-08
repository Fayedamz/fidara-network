use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum FidaraError {
    /// milestone_count must be between 1 and 12 inclusive.
    InvalidMilestoneCount = 1,
    /// learner and mentor must be different addresses.
    LearnerIsMentor = 2,
    /// mentor and forfeit_recipient must be different addresses.
    MentorIsForfeitRecipient = 3,
    /// The requested plan does not exist.
    PlanNotFound = 4,
    /// The requested milestone index is out of range.
    InvalidMilestoneIndex = 5,
    /// The plan is not Active (required for milestone operations).
    PlanNotActive = 6,
    /// Caller is not the learner.
    NotLearner = 7,
    /// Caller is not the mentor.
    NotMentor = 8,
    /// Milestone is not in the Pending state.
    NotPending = 9,
    /// Milestone is not in the Submitted state.
    NotSubmitted = 10,
    /// The plan deadline has already passed.
    DeadlinePassed = 11,
    /// The review window has not yet elapsed.
    ReviewWindowOpen = 12,
    /// The deadline has not yet passed (for forfeit).
    DeadlineNotPassed = 13,
    /// The review window for rejection has closed.
    ReviewWindowClosed = 14,
    /// stake_amount must be greater than zero.
    InvalidStakeAmount = 15,
    /// deadline_ledger must be in the future by at least review_window_ledgers.
    InvalidDeadline = 16,
    /// review_window_ledgers is below the minimum (MIN_REVIEW_WINDOW_LEDGERS).
    ReviewWindowTooShort = 17,
    /// The plan is not in AwaitingMentor status (required for accept/cancel).
    PlanNotAwaitingMentor = 18,
}
