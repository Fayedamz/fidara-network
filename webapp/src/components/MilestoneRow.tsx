import React from "react";
import type { Milestone } from "../types/contract";
import { formatLedgerWithDate } from "../lib/ledger";

interface Props {
  index: number;
  milestone: Milestone;
  reviewWindowLedgers: number;
  /** If provided, show a Submit button for the learner. */
  onSubmit?: (index: number) => void;
  /** If provided, show Verify / Reject buttons for the mentor. */
  onVerify?: (index: number) => void;
  onReject?: (index: number) => void;
  /** If provided, show Claim Unreviewed button. */
  onClaimUnreviewed?: (index: number) => void;
  /** If provided, show Forfeit button. */
  onForfeit?: (index: number) => void;
  loading?: boolean;
}

const STATUS_LABELS: Record<Milestone["status"], string> = {
  Pending: "Pending",
  Submitted: "Awaiting Review",
  Verified: "Verified ✓",
  Forfeited: "Forfeited",
};

export function MilestoneRow({
  index,
  milestone,
  reviewWindowLedgers,
  onSubmit,
  onVerify,
  onReject,
  onClaimUnreviewed,
  onForfeit,
  loading,
}: Props) {
  const reviewDeadlineLedger =
    milestone.submitted_at > 0
      ? milestone.submitted_at + reviewWindowLedgers
      : null;

  return (
    <tr className={`milestone-row status-${milestone.status.toLowerCase()}`}>
      <td>Milestone {index + 1}</td>
      <td>
        <span
          className={`badge badge-${milestone.status.toLowerCase()}`}
          aria-label={`Status: ${STATUS_LABELS[milestone.status]}`}
        >
          {STATUS_LABELS[milestone.status]}
        </span>
      </td>
      <td>{milestone.share.toLocaleString()} stroops</td>
      <td>
        {reviewDeadlineLedger
          ? `Review by: ${formatLedgerWithDate(reviewDeadlineLedger)}`
          : "—"}
      </td>
      <td className="actions">
        {milestone.status === "Pending" && onSubmit && (
          <button
            onClick={() => onSubmit(index)}
            disabled={loading}
            aria-label={`Submit milestone ${index + 1}`}
          >
            Submit
          </button>
        )}
        {milestone.status === "Submitted" && onVerify && (
          <button
            onClick={() => onVerify(index)}
            disabled={loading}
            className="btn-verify"
            aria-label={`Verify milestone ${index + 1}`}
          >
            Verify
          </button>
        )}
        {milestone.status === "Submitted" && onReject && (
          <button
            onClick={() => onReject(index)}
            disabled={loading}
            className="btn-reject"
            aria-label={`Reject milestone ${index + 1}`}
          >
            Reject
          </button>
        )}
        {milestone.status === "Submitted" && onClaimUnreviewed && (
          <button
            onClick={() => onClaimUnreviewed(index)}
            disabled={loading}
            className="btn-claim"
            aria-label={`Claim unreviewed milestone ${index + 1}`}
          >
            Claim (review window passed)
          </button>
        )}
        {milestone.status === "Pending" && onForfeit && (
          <button
            onClick={() => onForfeit(index)}
            disabled={loading}
            className="btn-forfeit"
            aria-label={`Forfeit milestone ${index + 1}`}
          >
            Forfeit
          </button>
        )}
      </td>
    </tr>
  );
}
