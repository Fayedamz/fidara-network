import { describe, it, expect } from "vitest";
import {
  ledgerToDate,
  dateToLedger,
  formatLedgerWithDate,
  isPastLedger,
  LEDGER_INTERVAL_SECS,
} from "../lib/ledger";

// Use a fixed base so tests are deterministic.
const BASE = 1_000_000;
const BASE_MS = new Date("2025-01-01T00:00:00Z").getTime();

describe("ledgerToDate", () => {
  it("returns base date for base ledger", () => {
    const d = ledgerToDate(BASE, BASE, BASE_MS);
    expect(d.getTime()).toBe(BASE_MS);
  });

  it("advances by LEDGER_INTERVAL_SECS per ledger", () => {
    const d = ledgerToDate(BASE + 1, BASE, BASE_MS);
    expect(d.getTime()).toBe(BASE_MS + LEDGER_INTERVAL_SECS * 1000);
  });

  it("goes backwards for ledgers before base", () => {
    const d = ledgerToDate(BASE - 10, BASE, BASE_MS);
    expect(d.getTime()).toBe(BASE_MS - 10 * LEDGER_INTERVAL_SECS * 1000);
  });

  it("handles large delta correctly", () => {
    // 1 day = 86400s / 5s = 17280 ledgers
    const oneDayLater = BASE + 17_280;
    const d = ledgerToDate(oneDayLater, BASE, BASE_MS);
    expect(d.getTime()).toBe(BASE_MS + 86_400_000);
  });
});

describe("dateToLedger", () => {
  it("returns base ledger for base date", () => {
    expect(dateToLedger(new Date(BASE_MS), BASE, BASE_MS)).toBe(BASE);
  });

  it("round-trips: ledgerToDate → dateToLedger", () => {
    const target = BASE + 500;
    const date = ledgerToDate(target, BASE, BASE_MS);
    expect(dateToLedger(date, BASE, BASE_MS)).toBe(target);
  });

  it("rounds correctly for fractional ledgers", () => {
    // 2.5 ledgers worth of ms → rounds to 3
    const halfLedgerMs = Math.round(2.5 * LEDGER_INTERVAL_SECS * 1000);
    const date = new Date(BASE_MS + halfLedgerMs);
    expect(dateToLedger(date, BASE, BASE_MS)).toBe(BASE + 3);
  });
});

describe("formatLedgerWithDate", () => {
  it("includes the ledger number", () => {
    const result = formatLedgerWithDate(BASE, BASE, BASE_MS);
    expect(result).toContain(BASE.toLocaleString());
  });

  it("includes a tilde for approximate date", () => {
    const result = formatLedgerWithDate(BASE, BASE, BASE_MS);
    expect(result).toContain("~");
  });

  it("includes the year of the base date", () => {
    const result = formatLedgerWithDate(BASE, BASE, BASE_MS);
    expect(result).toContain("2025");
  });
});

describe("isPastLedger", () => {
  it("returns true for a ledger far in the past", () => {
    // Use Date.now() as base, and a ledger far enough behind it to be in the past.
    const pastLedger = BASE - 1_000_000_000; // enormous negative offset → dates to long ago
    expect(isPastLedger(pastLedger, BASE, Date.now())).toBe(true);
  });

  it("returns false for a ledger far in the future", () => {
    const futureLedger = BASE + 1_000_000_000;
    expect(isPastLedger(futureLedger, BASE, Date.now())).toBe(false);
  });

  it("returns false for a future BASE_MS even if ledger == BASE", () => {
    // If the base timestamp is in the future, ledger == BASE is also in the future.
    const futureBaseMs = Date.now() + 100_000_000;
    expect(isPastLedger(BASE, BASE, futureBaseMs)).toBe(false);
  });
});
