import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MentorPage } from "../pages/MentorPage";

const MENTOR_KEY = "GMENTOR456";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../hooks/useWallet", () => ({
  useWallet: () => ({
    wallet: { connected: true, publicKey: MENTOR_KEY, error: null },
    loading: false,
    connect: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockActivePlan = {
  id: BigInt(1),
  learner: "GLEARNER123",
  mentor: MENTOR_KEY,
  token: "CTOKEN",
  stake_amount: BigInt(200),
  milestone_count: 2,
  deadline_ledger: 2_000_000,
  review_window_ledgers: 17_280,
  forfeit_recipient: "GFORFEIT789",
  status: "Active" as const,
  milestones: [
    { status: "Submitted" as const, submitted_at: 1_500_000, share: BigInt(100) },
    { status: "Pending" as const, submitted_at: 0, share: BigInt(100) },
  ],
};

const mockAwaitingPlan = {
  ...mockActivePlan,
  status: "AwaitingMentor" as const,
  milestones: [
    { status: "Pending" as const, submitted_at: 0, share: BigInt(100) },
    { status: "Pending" as const, submitted_at: 0, share: BigInt(100) },
  ],
};

let planOverride = mockActivePlan as typeof mockActivePlan | typeof mockAwaitingPlan;

vi.mock("../lib/contract", () => ({
  getPlan: vi.fn().mockImplementation(() => Promise.resolve(planOverride)),
  verifyMilestone: vi.fn().mockResolvedValue(undefined),
  rejectMilestone: vi.fn().mockResolvedValue(undefined),
  acceptPlan: vi.fn().mockResolvedValue(undefined),
}));

import { getPlan, verifyMilestone, rejectMilestone, acceptPlan } from "../lib/contract";

function renderPage() {
  return render(<MemoryRouter><MentorPage /></MemoryRouter>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MentorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planOverride = mockActivePlan;
  });

  it("renders the heading naming the mentor role", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /mentor page/i })).toBeInTheDocument();
  });

  it("names mentor role in intro text", () => {
    renderPage();
    expect(screen.getByText(/as a/i).closest("p")).toHaveTextContent("mentor");
  });

  it("states stake never goes to mentor in intro", () => {
    renderPage();
    expect(screen.getByText(/as a/i).closest("p")).toHaveTextContent(/never receive stake/i);
  });

  it("loads plan on plan ID entry", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => expect(getPlan).toHaveBeenCalledWith(BigInt(1)));
    await waitFor(() => screen.getByText(/plan #1/i));
  });

  it("shows Verify button for Submitted milestone when Active", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    expect(screen.getByRole("button", { name: /verify milestone 1/i })).toBeInTheDocument();
  });

  it("shows Reject button for Submitted milestone when Active", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    expect(screen.getByRole("button", { name: /reject milestone 1/i })).toBeInTheDocument();
  });

  it("no Verify/Reject for Pending milestone", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    expect(screen.queryByRole("button", { name: /verify milestone 2/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject milestone 2/i })).not.toBeInTheDocument();
  });

  it("calls verifyMilestone when Verify clicked", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    fireEvent.click(screen.getByRole("button", { name: /verify milestone 1/i }));
    await waitFor(() =>
      expect(verifyMilestone).toHaveBeenCalledWith(MENTOR_KEY, BigInt(1), 0)
    );
  });

  it("calls rejectMilestone when Reject clicked", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    fireEvent.click(screen.getByRole("button", { name: /reject milestone 1/i }));
    await waitFor(() =>
      expect(rejectMilestone).toHaveBeenCalledWith(MENTOR_KEY, BigInt(1), 0)
    );
  });

  it("shows success message after verify", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    fireEvent.click(screen.getByRole("button", { name: /verify milestone 1/i }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/verified/i)
    );
  });

  // ---------------------
  // Invitation tests
  // ---------------------

  it("shows invitation banner when plan is AwaitingMentor and user is the mentor", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    expect(screen.getByRole("status")).toHaveTextContent(/invitation/i);
  });

  it("shows Accept Plan button when awaiting mentor", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    expect(screen.getByRole("button", { name: /accept plan as mentor/i })).toBeInTheDocument();
  });

  it("calls acceptPlan when Accept is clicked", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    fireEvent.click(screen.getByRole("button", { name: /accept plan as mentor/i }));
    await waitFor(() => expect(acceptPlan).toHaveBeenCalledWith(MENTOR_KEY, BigInt(1)));
  });

  it("does not show Verify/Reject when plan is AwaitingMentor", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    expect(screen.queryByRole("button", { name: /verify milestone/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject milestone/i })).not.toBeInTheDocument();
  });

  it("shows plan details in invitation view", async () => {
    planOverride = mockAwaitingPlan;
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    // Stake and review window visible so mentor can make an informed decision.
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText(/17,280/)).toBeInTheDocument();
  });
});
