import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CreatePlan } from "../pages/CreatePlan";
import { MIN_REVIEW_WINDOW_LEDGERS } from "../types/contract";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let walletOverride: { connected: boolean; publicKey: string | null; error: string | null } | null =
  null;

vi.mock("../hooks/useWallet", () => ({
  useWallet: () => ({
    wallet: walletOverride ?? { connected: true, publicKey: "GLEARNER123", error: null },
    loading: false,
    connect: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../lib/contract", () => ({
  createPlan: vi.fn().mockResolvedValue(BigInt(0)),
  cancelPlan: vi.fn().mockResolvedValue(undefined),
}));

import { createPlan, cancelPlan } from "../lib/contract";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIN_DAYS = Math.ceil((MIN_REVIEW_WINDOW_LEDGERS * 5) / 86_400);

function renderPage() {
  return render(
    <MemoryRouter>
      <CreatePlan />
    </MemoryRouter>
  );
}

/** Fill in a valid form. */
function fillForm(overrides: Record<string, string> = {}) {
  // Pick a future date well beyond 1 day + review window.
  const futureDate = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    .toISOString()
    .split("T")[0];

  fireEvent.change(screen.getByLabelText(/mentor address/i), {
    target: { value: overrides.mentor ?? "GMENTOR456" },
  });
  fireEvent.change(screen.getByLabelText(/forfeit recipient/i), {
    target: { value: overrides.forfeitRecipient ?? "GFORFEIT789" },
  });
  fireEvent.change(screen.getByLabelText(/token contract address/i), {
    target: { value: overrides.token ?? "CTOKEN" },
  });
  fireEvent.change(screen.getByLabelText(/total stake amount/i), {
    target: { value: overrides.stakeAmount ?? "300" },
  });
  fireEvent.change(screen.getByLabelText(/number of milestones/i), {
    target: { value: overrides.milestoneCount ?? "3" },
  });
  fireEvent.change(screen.getByLabelText(/deadline/i), {
    target: { value: overrides.deadlineDate ?? futureDate },
  });
  fireEvent.change(screen.getByLabelText(/review window/i), {
    target: { value: overrides.reviewWindowDays ?? String(MIN_DAYS) },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreatePlan page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletOverride = null;
  });

  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /create commitment plan/i })).toBeInTheDocument();
  });

  it("names the learner role correctly in the intro", () => {
    renderPage();
    expect(screen.getByText(/as a/i).closest("p")).toHaveTextContent("learner");
  });

  it("renders all required fields", () => {
    renderPage();
    expect(screen.getByLabelText(/learner address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mentor address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/forfeit recipient/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/token contract address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/total stake amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/number of milestones/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/deadline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/review window/i)).toBeInTheDocument();
  });

  it("review window field has the minimum value set", () => {
    renderPage();
    const input = screen.getByLabelText(/review window/i) as HTMLInputElement;
    expect(Number(input.min)).toBe(MIN_DAYS);
  });

  it("shows awaiting mentor message after successful create", async () => {
    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /awaiting mentor/i })).toBeInTheDocument();
    });
    expect(createPlan).toHaveBeenCalledTimes(1);
  });

  it("shows Cancel and refund button while awaiting mentor", async () => {
    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => screen.getByRole("heading", { name: /awaiting mentor/i }));
    expect(screen.getByRole("button", { name: /cancel plan and refund/i })).toBeInTheDocument();
  });

  it("calls cancelPlan when Cancel is clicked", async () => {
    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => screen.getByRole("heading", { name: /awaiting mentor/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel plan and refund/i }));
    await waitFor(() => expect(cancelPlan).toHaveBeenCalled());
  });

  it("rejects zero stake with a validation message", async () => {
    renderPage();
    fillForm({ stakeAmount: "0" });
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/stake must be greater than zero/i);
    });
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("rejects a review window below the minimum", async () => {
    renderPage();
    fillForm({ reviewWindowDays: "0" });
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("alert").some((el) =>
        el.textContent?.toLowerCase().includes("review window")
      )).toBe(true);
    });
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("rejects a deadline in the past", async () => {
    renderPage();
    fillForm({ deadlineDate: "2020-01-01" });
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("alert").some((el) =>
        el.textContent?.toLowerCase().includes("deadline")
      )).toBe(true);
    });
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("shows error if wallet not connected", async () => {
    walletOverride = { connected: false, publicKey: null, error: null };
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/connect your wallet/i);
    });
  });

  it("shows error when createPlan throws", async () => {
    vi.mocked(createPlan).mockRejectedValueOnce(new Error("LearnerIsMentor"));
    renderPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("LearnerIsMentor");
    });
  });
});
