// ---------------------------------------------------------------------------
// Types mirroring the on-chain contract structs.
// ---------------------------------------------------------------------------

export type MilestoneStatus = "Pending" | "Submitted" | "Verified" | "Forfeited";
export type PlanStatus = "Active" | "Completed";

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
