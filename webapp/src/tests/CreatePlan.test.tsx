import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CreatePlan } from "../pages/CreatePlan";

// --- mock wallet hook ---
const mockWallet = { connected: true, publicKey: "GLEARNER123", error: null };
vi.mock("../hooks/useWallet", () => ({
  useWallet: () => ({ wallet: mockWallet, loading: false, connect: vi.fn(), refresh: vi.fn() }),
}));

// --- mock contract ---
vi.mock("../lib/contract", () => ({
  createPlan: vi.fn().mockResolvedValue(BigInt(0)),
}));

import { createPlan } from "../lib/contract";

function renderPage() {
  return render(
    <MemoryRouter>
      <CreatePlan />
    </MemoryRouter>
  );
}

describe("CreatePlan page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("shows success message with plan id after submit", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/mentor address/i), { target: { value: "GMENTOR456" } });
    fireEvent.change(screen.getByLabelText(/forfeit recipient/i), { target: { value: "GFORFEIT789" } });
    fireEvent.change(screen.getByLabelText(/token contract address/i), { target: { value: "CTOKEN" } });
    fireEvent.change(screen.getByLabelText(/total stake amount/i), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText(/number of milestones/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/deadline/i), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText(/review window/i), { target: { value: "7" } });

    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Plan created!");
    });
    expect(createPlan).toHaveBeenCalledTimes(1);
  });

  it("shows error if wallet not connected", async () => {
    mockWallet.connected = false;
    mockWallet.publicKey = null;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/connect your wallet/i);
    });
    mockWallet.connected = true;
    mockWallet.publicKey = "GLEARNER123";
  });

  it("shows error when createPlan throws", async () => {
    vi.mocked(createPlan).mockRejectedValueOnce(new Error("LearnerIsMentor"));
    renderPage();
    fireEvent.change(screen.getByLabelText(/mentor address/i), { target: { value: "GMENTOR456" } });
    fireEvent.change(screen.getByLabelText(/forfeit recipient/i), { target: { value: "GFORFEIT789" } });
    fireEvent.change(screen.getByLabelText(/token contract address/i), { target: { value: "CTOKEN" } });
    fireEvent.change(screen.getByLabelText(/total stake amount/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/number of milestones/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/deadline/i), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText(/review window/i), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /create plan/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("LearnerIsMentor");
    });
  });
});
