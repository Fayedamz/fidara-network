import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MentorPage } from "../pages/MentorPage";

const MENTOR_KEY = "GMENTOR456";

vi.mock("../hooks/useWallet", () => ({
  useWallet: () => ({
    wallet: { connected: true, publicKey: "GMENTOR456", error: null },
    loading: false,
    connect: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../lib/contract", () => ({
  getPlan: vi.fn().mockResolvedValue({
    id: BigInt(1),
    learner: "GLEARNER123",
    mentor: "GMENTOR456",
    token: "CTOKEN",
    stake_amount: BigInt(200),
    milestone_count: 2,
    deadline_ledger: 2_000_000,
    review_window_ledgers: 17_280,
    forfeit_recipient: "GFORFEIT789",
    status: "Active",
    milestones: [
      { status: "Submitted", submitted_at: 1_500_000, share: BigInt(100) },
      { status: "Pending", submitted_at: 0, share: BigInt(100) },
    ],
  }),
  verifyMilestone: vi.fn().mockResolvedValue(undefined),
  rejectMilestone: vi.fn().mockResolvedValue(undefined),
}));

import { getPlan, verifyMilestone, rejectMilestone } from "../lib/contract";

function renderPage() {
  return render(<MemoryRouter><MentorPage /></MemoryRouter>);
}

describe("MentorPage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

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

  it("shows Verify button for Submitted milestone", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/plan id to review/i), { target: { value: "1" } });
    await waitFor(() => screen.getByText(/plan #1/i));
    expect(screen.getByRole("button", { name: /verify milestone 1/i })).toBeInTheDocument();
  });

  it("shows Reject button for Submitted milestone", async () => {
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
});
