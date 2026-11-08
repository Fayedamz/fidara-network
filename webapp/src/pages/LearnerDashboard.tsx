import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "../hooks/useWallet";
import {
  getPlan,
  submitMilestone,
  claimUnreviewed,
  forfeitMilestone,
  cancelPlan,
} from "../lib/contract";
import { formatLedgerWithDate } from "../lib/ledger";
import { MilestoneRow } from "../components/MilestoneRow";
import type { Plan } from "../types/contract";

export function LearnerDashboard() {
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

  useEffect(() => {
    if (planIdInput.trim()) loadPlan(planIdInput.trim());
  }, [planIdInput, loadPlan]);

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

  function handleSubmit(index: number) {
    doAction(
      () => submitMilestone(wallet.publicKey!, BigInt(planIdInput), index),
      `Milestone ${index + 1} submitted for review.`
    );
  }

  function handleClaimUnreviewed(index: number) {
    doAction(
      () => claimUnreviewed(wallet.publicKey!, BigInt(planIdInput), index),
      `Milestone ${index + 1} claimed — stake paid to learner.`
    );
  }

  function handleForfeit(index: number) {
    doAction(
      () => forfeitMilestone(wallet.publicKey!, BigInt(planIdInput), index),
      `Milestone ${index + 1} forfeited — stake paid to forfeit recipient.`
    );
  }

  function handleCancel() {
    doAction(
      () => cancelPlan(wallet.publicKey!, BigInt(planIdInput)),
      "Plan cancelled — full stake refunded to learner."
    );
  }

  const isLearner = plan && wallet.publicKey === plan.learner;
  const isActive = plan?.status === "Active";
  const isAwaiting = plan?.status === "AwaitingMentor";

  return (
    <main className="page page-learner">
      <h1>Learner Dashboard</h1>
      <p className="intro">
        As a <strong>learner</strong>, submit milestones before the deadline.
        If the mentor doesn't review within the review window, anyone can claim
        your stake back on your behalf.
      </p>

      <section aria-label="Load plan">
        <label htmlFor="planId">Plan ID</label>
        <input
          id="planId"
          type="number"
          min="0"
          value={planIdInput}
          onChange={(e) => setPlanIdInput(e.target.value)}
          placeholder="0"
          aria-label="Plan ID to load"
        />
      </section>

      {fetchError && (
        <p className="error" role="alert">{fetchError}</p>
      )}

      {plan && (
        <section aria-label="Plan details">
          <h2>Plan #{plan.id.toString()}</h2>
          <dl className="plan-meta">
            <dt>Status</dt>
            <dd>
              <span className={`badge badge-${plan.status.toLowerCase().replace(/\s/g, "-")}`}>
                {plan.status === "AwaitingMentor" ? "Awaiting Mentor" : plan.status}
              </span>
            </dd>
            <dt>Learner</dt>
            <dd>{plan.learner}</dd>
            <dt>Mentor</dt>
            <dd>{plan.mentor}</dd>
            <dt>Forfeit Recipient</dt>
            <dd>{plan.forfeit_recipient}</dd>
            <dt>Total Stake</dt>
            <dd>{plan.stake_amount.toLocaleString()} stroops</dd>
            <dt>Deadline</dt>
            <dd>{formatLedgerWithDate(plan.deadline_ledger)}</dd>
          </dl>

          {isAwaiting && (
            <div className="status-banner banner-awaiting" role="status">
              <strong>Awaiting mentor acceptance.</strong> Milestone actions are
              disabled until your mentor accepts this plan. Share plan ID{" "}
              <strong>{plan.id.toString()}</strong> with your mentor ({plan.mentor}).
              {isLearner && (
                <div style={{ marginTop: "0.75rem" }}>
                  <button
                    onClick={handleCancel}
                    disabled={loading}
                    className="btn-reject"
                    aria-label="Cancel plan and refund stake"
                  >
                    Cancel plan and refund stake
                  </button>
                </div>
              )}
            </div>
          )}

          {plan.status === "Cancelled" && (
            <p className="notice" role="note">
              This plan was cancelled. The full stake has been refunded to the learner.
            </p>
          )}

          {plan.status === "Completed" && (
            <p className="success" role="status">
              This plan is completed. All milestones have been resolved.
            </p>
          )}

          {!isLearner && wallet.connected && isActive && (
            <p className="notice" role="note">
              Your wallet is not the learner for this plan. You can still claim
              unreviewed milestones or forfeit missed ones.
            </p>
          )}

          {(isActive || plan.status === "Completed") && (
            <table aria-label="Milestones">
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
                    onSubmit={isLearner && isActive ? handleSubmit : undefined}
                    onClaimUnreviewed={isActive ? handleClaimUnreviewed : undefined}
                    onForfeit={isActive ? handleForfeit : undefined}
                    loading={loading}
                  />
                ))}
              </tbody>
            </table>
          )}

          {isAwaiting && (
            <table aria-label="Milestones (locked — awaiting mentor)">
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
                    // No action handlers — plan not yet Active
                    loading={loading}
                  />
                ))}
              </tbody>
            </table>
          )}

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
