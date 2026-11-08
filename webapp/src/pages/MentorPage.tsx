import React, { useState, useCallback } from "react";
import { useWallet } from "../hooks/useWallet";
import { getPlan, verifyMilestone, rejectMilestone } from "../lib/contract";
import { formatLedgerWithDate } from "../lib/ledger";
import { MilestoneRow } from "../components/MilestoneRow";
import type { Plan } from "../types/contract";

export function MentorPage() {
  const { wallet } = useWallet();
  const [planIdInput, setPlanIdInput] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPlan = useCallback(async (id: string) => {
    setFetchError(null);
    setPlan(null);
    try {
      const p = await getPlan(BigInt(id));
      setPlan(p);
    } catch (e) {
      setFetchError(String(e));
    }
  }, []);

  async function doAction(fn: () => Promise<void>, successMsg: string) {
    if (!wallet.connected || !wallet.publicKey) {
      setActionStatus("Connect your wallet first.");
      return;
    }
    setLoading(true);
    setActionStatus(null);
    try {
      await fn();
      setActionStatus(successMsg);
      if (planIdInput.trim()) await loadPlan(planIdInput.trim());
    } catch (e) {
      setActionStatus(`Error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleVerify(index: number) {
    doAction(
      () => verifyMilestone(wallet.publicKey!, BigInt(planIdInput), index),
      `Milestone ${index + 1} verified — stake share paid to learner.`
    );
  }

  function handleReject(index: number) {
    doAction(
      () => rejectMilestone(wallet.publicKey!, BigInt(planIdInput), index),
      `Milestone ${index + 1} rejected — learner may resubmit.`
    );
  }

  const isMentor = plan && wallet.publicKey === plan.mentor;

  return (
    <main className="page page-mentor">
      <h1>Mentor Page</h1>
      <p className="intro">
        As a <strong>mentor</strong>, review submitted milestones. Verify
        delivery to release the stake to the learner, or reject within the
        review window so the learner can resubmit. You never receive stake —
        only the learner or the forfeit recipient do.
      </p>

      <section aria-label="Load plan">
        <label htmlFor="planIdMentor">Plan ID</label>
        <input
          id="planIdMentor"
          type="number"
          min="0"
          value={planIdInput}
          onChange={(e) => {
            setPlanIdInput(e.target.value);
            if (e.target.value.trim()) loadPlan(e.target.value.trim());
          }}
          placeholder="0"
          aria-label="Plan ID to review"
        />
      </section>

      {fetchError && (
        <p className="error" role="alert">{fetchError}</p>
      )}

      {plan && (
        <section aria-label="Plan review">
          <h2>Plan #{plan.id.toString()}</h2>

          {!isMentor && wallet.connected && (
            <p className="warning" role="note">
              Your wallet ({wallet.publicKey}) is not the assigned mentor for
              this plan. Only the mentor can verify or reject.
            </p>
          )}

          <dl className="plan-meta">
            <dt>Status</dt>
            <dd>
              <span className={`badge badge-${plan.status.toLowerCase()}`}>
                {plan.status}
              </span>
            </dd>
            <dt>Learner</dt>
            <dd>{plan.learner}</dd>
            <dt>Mentor (you)</dt>
            <dd>{plan.mentor}</dd>
            <dt>Forfeit Recipient</dt>
            <dd>{plan.forfeit_recipient}</dd>
            <dt>Deadline</dt>
            <dd>{formatLedgerWithDate(plan.deadline_ledger)}</dd>
            <dt>Review Window</dt>
            <dd>
              {plan.review_window_ledgers.toLocaleString()} ledgers (~
              {Math.round((plan.review_window_ledgers * 5) / 86_400)} days)
            </dd>
          </dl>

          <table aria-label="Milestones to review">
            <thead>
              <tr>
                <th scope="col">Milestone</th>
                <th scope="col">Status</th>
                <th scope="col">Share</th>
                <th scope="col">Review Deadline</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plan.milestones.map((m, i) => (
                <MilestoneRow
                  key={i}
                  index={i}
                  milestone={m}
                  reviewWindowLedgers={plan.review_window_ledgers}
                  onVerify={isMentor ? handleVerify : undefined}
                  onReject={isMentor ? handleReject : undefined}
                  loading={loading}
                />
              ))}
            </tbody>
          </table>

          {actionStatus && (
            <p
              className={actionStatus.startsWith("Error") ? "error" : "success"}
              role="status"
            >
              {actionStatus}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
