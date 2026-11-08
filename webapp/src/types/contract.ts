// ---------------------------------------------------------------------------
// Types mirroring the on-chain contract structs.
// ---------------------------------------------------------------------------

export type MilestoneStatus = "Pending" | "Submitted" | "Verified" | "Forfeited";
export type PlanStatus = "AwaitingMentor" | "Active" | "Completed" | "Cancelled";

export interface Milestone {
  status: MilestoneStatus;
  submitted_at: number;
  share: bigint;
}

export interface Plan {
  id: bigint;
  learner: string;
  mentor: string;
  token: string;
  stake_amount: bigint;
  milestone_count: number;
  deadline_ledger: number;
  review_window_ledgers: number;
  forfeit_recipient: string;
  status: PlanStatus;
  milestones: Milestone[];
}

export interface CreatePlanParams {
  learner: string;
  mentor: string;
  token: string;
  stakeAmount: bigint;
  milestoneCount: number;
  reviewWindowLedgers: number;
  deadlineLedger: number;
  forfeitRecipient: string;
}

/** Minimum review window in ledgers (1 day ≈ 17 280 ledgers at 5 s/ledger). */
export const MIN_REVIEW_WINDOW_LEDGERS = 17_280;
