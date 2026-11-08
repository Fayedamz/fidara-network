import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LearnerDashboard } from "../pages/LearnerDashboard";

const LEARNER_KEY = "GLEARNER123";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../hooks/useWallet", () => ({
  useWallet: () => ({
    wallet: { connected: true, publicKey: LEARNER_KEY, error: null },
    loading: false,
    connect: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockActivePlan = {
  id: BigInt(0),
  learner: LEARNER_KEY,
  mentor: "GMENTOR456",
  token: "CTOKEN",
  stake_amount: BigInt(300),
  milestone_count: 3,
  deadline_ledger: 2_000_000,
  review_window_ledgers: 17_280,
  forfeit_recipient: "GFORFEIT789",
  status: "Active" as const,
  milestones: [
    { status: "Pending" as const, submitted_at: 0, share: BigInt(100) },
    { status: "Submitted" as const, submitted_at: 1_500_000, share: BigInt(100) },
    { status: "Verified" as const, submitted_at: 1_400_000, share: BigInt(100) },
  ],
};

const mockAwaitingPlan = {
  ...mockActivePlan,
  status: "AwaitingMentor" as const,
};

let planOverride = mockActivePlan as typeof mockActivePlan | typeof mockAwaitingPlan;

vi.mock("../lib/contract", () => ({
  getPlan: vi.fn().mockImplementation(() => Promise.resolve(planOverride)),
  submitMilestone: vi.fn().mockResolvedValue(undefined),
  claimUnreviewed: vi.fn().mockResolvedValue(undefined),
  forfeitMilestone: vi.fn().mockResolvedValue(undefined),
  cancelPlan: vi.fn().mockResolvedValue(undefined),
}));

import { getPlan, submitMilestone, cancelPlan } from "../lib/contract";

function renderPage() {
  return render(<MemoryRouter><LearnerDashboard /></MemoryRouter>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LearnerDashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planOverride = mockActivePlan;
  });

  it("renders the page heading naming the learner role", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /learner dashboard/i })).toBeInTheDocument();
  });

  it("names learner role in intro text", () => {
    renderPage();
    expect(screen.getByText(/as a/i).closest("p")).toHaveTextContent("learner");
  });

  it("loads and displays plan on entering plan ID", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => expect(getPlan).toHaveBeenCalledWith(BigInt(0)));
    await waitFor(() => expect(screen.getByText(/plan #0/i)).toBeInTheDocument());
  });

  it("shows Submit button for Pending milestones when Active", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    expect(screen.getAllByRole("button", { name: /submit milestone 1/i }).length).toBeGreaterThan(0);
  });

  it("does not show Submit for Verified milestones", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    expect(screen.queryByLabelText(/submit milestone 3/i)).not.toBeInTheDocument();
  });

  it("calls submitMilestone when Submit clicked", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    fireEvent.click(screen.getByRole("button", { name: /submit milestone 1/i }));
    await waitFor(() => expect(submitMilestone).toHaveBeenCalledWith(LEARNER_KEY, BigInt(0), 0));
  });

  it("shows the learner address in the plan meta", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    expect(screen.getByText(LEARNER_KEY)).toBeInTheDocument();
  });

  it("shows deadline in plan meta", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    expect(screen.getAllByText(/deadline/i).length).toBeGreaterThan(0);
  });

  // ---------------------
  // AwaitingMentor tests
  // ---------------------

  it("shows awaiting mentor banner when plan is AwaitingMentor", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    expect(screen.getByRole("status")).toHaveTextContent(/awaiting mentor/i);
  });

  it("shows Cancel button while AwaitingMentor for the learner", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    expect(screen.getByRole("button", { name: /cancel plan and refund/i })).toBeInTheDocument();
  });

  it("submit actions are disabled while plan awaits mentor", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    // No submit button should appear for AwaitingMentor plans.
    expect(screen.queryByRole("button", { name: /submit milestone/i })).not.toBeInTheDocument();
  });

  it("calls cancelPlan when Cancel clicked on AwaitingMentor plan", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    fireEvent.click(screen.getByRole("button", { name: /cancel plan and refund/i }));
    await waitFor(() => expect(cancelPlan).toHaveBeenCalledWith(LEARNER_KEY, BigInt(0)));
  });
});
