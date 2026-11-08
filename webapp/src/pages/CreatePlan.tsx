import React, { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { createPlan } from "../lib/contract";
import { dateToLedger } from "../lib/ledger";
import type { CreatePlanParams } from "../types/contract";

export function CreatePlan() {
  const { wallet } = useWallet();

  const [form, setForm] = useState({
    learner: wallet.publicKey ?? "",
    mentor: "",
    token: "",
    stakeAmount: "",
    milestoneCount: "3",
    reviewWindowDays: "7",
    deadlineDate: "",
    forfeitRecipient: "",
  });

  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "pending" } | { kind: "ok"; id: bigint } | { kind: "err"; msg: string }
  >({ kind: "idle" });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.connected || !wallet.publicKey) {
      setStatus({ kind: "err", msg: "Connect your wallet first." });
      return;
    }

    const deadlineLedger = dateToLedger(new Date(form.deadlineDate));
    const reviewWindowLedgers = Math.round(
      (Number(form.reviewWindowDays) * 86_400) / 5
    );

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
      setStatus({ kind: "ok", id });
    } catch (err) {
      setStatus({ kind: "err", msg: String(err) });
    }
  }

  return (
    <main className="page page-create">
      <h1>Create Commitment Plan</h1>
      <p className="intro">
        As a <strong>learner</strong>, stake tokens against milestones you commit
        to deliver. A mentor reviews your work. If you miss a milestone, your
        stake for that milestone goes to the forfeit recipient — never to the mentor.
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
          />

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
          />
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

          <label htmlFor="stakeAmount">Total stake amount (stroops)</label>
          <input
            id="stakeAmount"
            type="number"
            min="1"
            value={form.stakeAmount}
            onChange={set("stakeAmount")}
            required
            aria-required="true"
          />
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
          />

          <label htmlFor="reviewWindowDays">
            Mentor review window (days)
          </label>
          <input
            id="reviewWindowDays"
            type="number"
            min="1"
            value={form.reviewWindowDays}
            onChange={set("reviewWindowDays")}
            required
            aria-required="true"
          />
        </fieldset>

        <button type="submit" disabled={status.kind === "pending"}>
          {status.kind === "pending" ? "Creating plan…" : "Create Plan"}
        </button>
      </form>

      {status.kind === "ok" && (
        <p className="success" role="status">
          Plan created! ID: <strong>{status.id.toString()}</strong>
        </p>
      )}
      {status.kind === "err" && (
        <p className="error" role="alert">
          {status.msg}
        </p>
      )}
    </main>
  );
}
