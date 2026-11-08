import React, { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { createPlan, cancelPlan } from "../lib/contract";
import { dateToLedger, formatLedgerWithDate, BASE_LEDGER, BASE_TIMESTAMP_MS } from "../lib/ledger";
import { MIN_REVIEW_WINDOW_LEDGERS, type CreatePlanParams } from "../types/contract";

/** Minimum review window in days (mirrors MIN_REVIEW_WINDOW_LEDGERS ≈ 1 day). */
const MIN_REVIEW_WINDOW_DAYS = Math.ceil((MIN_REVIEW_WINDOW_LEDGERS * 5) / 86_400);

type CreatePlanStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "awaiting"; id: bigint }
  | { kind: "cancelling"; id: bigint }
  | { kind: "cancelled" }
  | { kind: "err"; msg: string };

export function CreatePlan() {
  const { wallet } = useWallet();

  const [form, setForm] = useState({
    learner: wallet.publicKey ?? "",
    mentor: "",
    token: "",
    stakeAmount: "",
    milestoneCount: "3",
    reviewWindowDays: String(MIN_REVIEW_WINDOW_DAYS),
    deadlineDate: "",
    forfeitRecipient: "",
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [status, setStatus] = useState<CreatePlanStatus>({ kind: "idle" });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setValidationErrors((v) => ({ ...v, [field]: "" }));
  };

  function validate(): boolean {
    const errs: Record<string, string> = {};
    const stake = Number(form.stakeAmount);
    if (!form.stakeAmount || stake <= 0) {
      errs.stakeAmount = "Stake must be greater than zero.";
    }
    const reviewDays = Number(form.reviewWindowDays);
    if (!reviewDays || reviewDays < MIN_REVIEW_WINDOW_DAYS) {
      errs.reviewWindowDays = `Review window must be at least ${MIN_REVIEW_WINDOW_DAYS} day(s) (~1 day minimum).`;
    }
    if (!form.deadlineDate) {
      errs.deadlineDate = "A deadline is required.";
    } else {
      const deadlineDate = new Date(form.deadlineDate);
      if (deadlineDate <= new Date()) {
        errs.deadlineDate = "Deadline must be in the future.";
      }
      // Check deadline > current + review window
      const reviewLedgers = Math.round((reviewDays * 86_400) / 5);
      const deadlineLedger = dateToLedger(deadlineDate, BASE_LEDGER, BASE_TIMESTAMP_MS);
      // Current ledger estimate
      const nowLedger = dateToLedger(new Date(), BASE_LEDGER, BASE_TIMESTAMP_MS);
      if (deadlineLedger <= nowLedger + reviewLedgers) {
        errs.deadlineDate = `Deadline must be more than ${reviewDays} day(s) from now to fit the review window.`;
      }
    }
    if (!form.mentor.trim()) errs.mentor = "Mentor address is required.";
    if (!form.forfeitRecipient.trim()) errs.forfeitRecipient = "Forfeit recipient address is required.";
    if (!form.token.trim()) errs.token = "Token address is required.";
    if (form.mentor.trim() && form.learner.trim() && form.mentor.trim() === form.learner.trim()) {
      errs.mentor = "Mentor must differ from learner.";
    }
    if (form.mentor.trim() && form.forfeitRecipient.trim() && form.mentor.trim() === form.forfeitRecipient.trim()) {
      errs.forfeitRecipient = "Forfeit recipient must differ from mentor.";
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.connected || !wallet.publicKey) {
      setStatus({ kind: "err", msg: "Connect your wallet first." });
      return;
    }
    if (!validate()) return;

    const reviewWindowLedgers = Math.round(
      (Number(form.reviewWindowDays) * 86_400) / 5
    );
    const deadlineLedger = dateToLedger(new Date(form.deadlineDate), BASE_LEDGER, BASE_TIMESTAMP_MS);

    const params: CreatePlanParams = {
      learner: form.learner,
      mentor: form.mentor,
      token: form.token,
      stakeAmount: BigInt(form.stakeAmount),
      milestoneCount: Number(form.milestoneCount),
      reviewWindowLedgers,
      deadlineLedger,
      forfeitRecipient: form.forfeitRecipient,
    };

    setStatus({ kind: "pending" });
    try {
      const id = await createPlan(wallet.publicKey, params);
      setStatus({ kind: "awaiting", id });
    } catch (err) {
      setStatus({ kind: "err", msg: String(err) });
    }
  }

  async function handleCancel() {
    if (status.kind !== "awaiting" || !wallet.publicKey) return;
    const id = status.id;
    setStatus({ kind: "cancelling", id });
    try {
      await cancelPlan(wallet.publicKey, id);
      setStatus({ kind: "cancelled" });
    } catch (err) {
      setStatus({ kind: "err", msg: String(err) });
    }
  }

  // ---- post-creation AwaitingMentor state ----
  if (status.kind === "awaiting" || status.kind === "cancelling") {
    const id = status.id;
    const deadlineLedger = dateToLedger(new Date(form.deadlineDate), BASE_LEDGER, BASE_TIMESTAMP_MS);
    return (
      <main className="page page-create">
        <h1>Plan Created — Awaiting Mentor</h1>
        <p className="intro">
          Your plan (ID: <strong>{id.toString()}</strong>) has been created and
          your stake is held in the contract. The plan is now <strong>awaiting your
          mentor's acceptance</strong>. Share the plan ID with your mentor so they can
          call "Accept Plan" on the Mentor page.
        </p>
        <dl className="plan-meta">
          <dt>Plan ID</dt><dd>{id.toString()}</dd>
          <dt>Mentor to notify</dt><dd>{form.mentor}</dd>
          <dt>Stake</dt><dd>{form.stakeAmount} stroops</dd>
          <dt>Deadline</dt>
          <dd>{formatLedgerWithDate(deadlineLedger, BASE_LEDGER, BASE_TIMESTAMP_MS)}</dd>
          <dt>Review window</dt>
          <dd>{form.reviewWindowDays} day(s)</dd>
        </dl>
        <p className="notice" role="note">
          If the mentor does not accept before the deadline, you can cancel and
          receive a full refund of your stake.
        </p>
        <button
          onClick={handleCancel}
          disabled={status.kind === "cancelling"}
          className="btn-reject"
          aria-label="Cancel plan and refund stake"
        >
          Cancel plan and refund stake
        </button>
      </main>
    );
  }

  if (status.kind === "cancelled") {
    return (
      <main className="page page-create">
        <h1>Plan Cancelled</h1>
        <p className="success" role="status">
          Your plan has been cancelled and the full stake has been refunded to your
          learner address.
        </p>
      </main>
    );
  }

  return (
    <main className="page page-create">
      <h1>Create Commitment Plan</h1>
      <p className="intro">
        As a <strong>learner</strong>, stake tokens against milestones you commit
        to deliver. The plan is created and your stake is locked in the contract.
        Your mentor must then <strong>accept the plan</strong> before any milestone
        work can begin. If you miss a milestone, your stake for that milestone goes
        to the forfeit recipient — never to the mentor.
      </p>

      <form onSubmit={handleSubmit} aria-label="Create commitment plan form" noValidate>
        <fieldset>
          <legend>Roles</legend>

          <label htmlFor="learner">Learner address (you, the one staking)</label>
          <input
            id="learner"
            type="text"
            value={form.learner}
            onChange={set("learner")}
            placeholder="G…"
            required
            aria-required="true"
          />

          <label htmlFor="mentor">Mentor address (must differ from learner)</label>
          <input
            id="mentor"
            type="text"
            value={form.mentor}
            onChange={set("mentor")}
            placeholder="G…"
            required
            aria-required="true"
            aria-describedby={validationErrors.mentor ? "mentor-err" : undefined}
          />
          {validationErrors.mentor && (
            <span id="mentor-err" className="field-error" role="alert">
              {validationErrors.mentor}
            </span>
          )}

          <label htmlFor="forfeitRecipient">
            Forfeit recipient (must differ from mentor)
          </label>
          <input
            id="forfeitRecipient"
            type="text"
            value={form.forfeitRecipient}
            onChange={set("forfeitRecipient")}
            placeholder="G…"
            required
            aria-required="true"
            aria-describedby={validationErrors.forfeitRecipient ? "forfeit-err" : undefined}
          />
          {validationErrors.forfeitRecipient && (
            <span id="forfeit-err" className="field-error" role="alert">
              {validationErrors.forfeitRecipient}
            </span>
          )}
        </fieldset>

        <fieldset>
          <legend>Stake</legend>

          <label htmlFor="token">Token contract address</label>
          <input
            id="token"
            type="text"
            value={form.token}
            onChange={set("token")}
            placeholder="C…"
            required
            aria-required="true"
          />

          <label htmlFor="stakeAmount">Total stake amount (stroops, must be &gt; 0)</label>
          <input
            id="stakeAmount"
            type="number"
            min="1"
            value={form.stakeAmount}
            onChange={set("stakeAmount")}
            required
            aria-required="true"
            aria-describedby={validationErrors.stakeAmount ? "stake-err" : undefined}
          />
          {validationErrors.stakeAmount && (
            <span id="stake-err" className="field-error" role="alert">
              {validationErrors.stakeAmount}
            </span>
          )}
        </fieldset>

        <fieldset>
          <legend>Milestones &amp; Timeline</legend>

          <label htmlFor="milestoneCount">
            Number of milestones (1–12, each gets an equal share)
          </label>
          <input
            id="milestoneCount"
            type="number"
            min="1"
            max="12"
            value={form.milestoneCount}
            onChange={set("milestoneCount")}
            required
            aria-required="true"
          />

          <label htmlFor="deadlineDate">
            Deadline (approximate — converted to ledger number)
          </label>
          <input
            id="deadlineDate"
            type="date"
            value={form.deadlineDate}
            onChange={set("deadlineDate")}
            required
            aria-required="true"
            aria-describedby={validationErrors.deadlineDate ? "deadline-err" : undefined}
          />
          {validationErrors.deadlineDate && (
            <span id="deadline-err" className="field-error" role="alert">
              {validationErrors.deadlineDate}
            </span>
          )}

          <label htmlFor="reviewWindowDays">
            Mentor review window (days, minimum {MIN_REVIEW_WINDOW_DAYS})
          </label>
          <input
            id="reviewWindowDays"
            type="number"
            min={MIN_REVIEW_WINDOW_DAYS}
            value={form.reviewWindowDays}
            onChange={set("reviewWindowDays")}
            required
            aria-required="true"
            aria-describedby={validationErrors.reviewWindowDays ? "window-err" : undefined}
          />
          {validationErrors.reviewWindowDays && (
            <span id="window-err" className="field-error" role="alert">
              {validationErrors.reviewWindowDays}
            </span>
          )}
        </fieldset>

        <button type="submit" disabled={status.kind === "pending"}>
          {status.kind === "pending" ? "Creating plan…" : "Create Plan"}
        </button>
      </form>

      {status.kind === "err" && (
        <p className="error" role="alert">
          {status.msg}
        </p>
      )}
    </main>
  );
}
