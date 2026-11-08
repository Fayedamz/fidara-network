import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LearnerDashboard } from "../pages/LearnerDashboard";

const LEARNER_KEY = "GLEARNER123";

// vi.mock is hoisted, so we cannot reference variables declared outside it.
// Define the mock return value inline.
vi.mock("../hooks/useWallet", () => ({
  useWallet: () => ({
    wallet: { connected: true, publicKey: "GLEARNER123", error: null },
    loading: false,
    connect: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../lib/contract", () => ({
  getPlan: vi.fn().mockResolvedValue({
    id: BigInt(0),
    learner: "GLEARNER123",
    mentor: "GMENTOR456",
    token: "CTOKEN",
    stake_amount: BigInt(300),
    milestone_count: 3,
    deadline_ledger: 2_000_000,
    review_window_ledgers: 17_280,
    forfeit_recipient: "GFORFEIT789",
    status: "Active",
    milestones: [
      { status: "Pending", submitted_at: 0, share: BigInt(100) },
      { status: "Submitted", submitted_at: 1_500_000, share: BigInt(100) },
      { status: "Verified", submitted_at: 1_400_000, share: BigInt(100) },
    ],
  }),
  submitMilestone: vi.fn().mockResolvedValue(undefined),
  claimUnreviewed: vi.fn().mockResolvedValue(undefined),
  forfeitMilestone: vi.fn().mockResolvedValue(undefined),
}));

import { getPlan, submitMilestone } from "../lib/contract";

function renderPage() {
  return render(<MemoryRouter><LearnerDashboard /></MemoryRouter>);
}

describe("LearnerDashboard page", () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
    await waitFor(() => {
      expect(getPlan).toHaveBeenCalledWith(BigInt(0));
    });
    await waitFor(() => {
      expect(screen.getByText(/plan #0/i)).toBeInTheDocument();
    });
  });

  it("shows Submit button for Pending milestones", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id/i), { target: { value: "0" } });
    await waitFor(() => screen.getByText(/plan #0/i));
    const submitButtons = screen.getAllByRole("button", { name: /submit milestone 1/i });
    expect(submitButtons.length).toBeGreaterThan(0);
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
    // "Deadline" appears as a <dt> in the plan meta section.
    const deadlineTerms = screen.getAllByText(/deadline/i);
    expect(deadlineTerms.length).toBeGreaterThan(0);
  });
});
