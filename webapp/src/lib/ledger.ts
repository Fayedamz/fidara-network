// ---------------------------------------------------------------------------
// Ledger ↔ approximate date helpers.
//
// Stellar Testnet produces ~1 ledger every 5 seconds.
// We anchor to the current ledger number + current timestamp to give
// human-readable approximate dates. The app never fetches a real network
// ledger number at startup — it uses a configurable constant so tests work
// offline.
// ---------------------------------------------------------------------------

/** Average seconds between ledgers on Stellar Testnet. */
export const LEDGER_INTERVAL_SECS = 5;

/**
 * Approximate current ledger on Stellar Testnet.
 * Override VITE_BASE_LEDGER and VITE_BASE_TIMESTAMP in .env for accuracy.
 */
export const BASE_LEDGER: number = Number(
  import.meta.env.VITE_BASE_LEDGER ?? 0
);

export const BASE_TIMESTAMP_MS: number = Number(
  import.meta.env.VITE_BASE_TIMESTAMP_MS ?? Date.now()
);

/**
 * Convert a ledger number to an approximate JavaScript Date.
 *
 * @param targetLedger - The ledger to convert.
 * @param baseLedger   - Reference ledger (defaults to BASE_LEDGER).
 * @param baseMs       - Timestamp in ms for the reference ledger (defaults to BASE_TIMESTAMP_MS).
 */
export function ledgerToDate(
  targetLedger: number,
  baseLedger: number = BASE_LEDGER,
  baseMs: number = BASE_TIMESTAMP_MS
): Date {
  const deltaLedgers = targetLedger - baseLedger;
  const deltaMs = deltaLedgers * LEDGER_INTERVAL_SECS * 1000;
  return new Date(baseMs + deltaMs);
}

/**
 * Format a ledger as both its raw number and an approximate date string.
 * Example: "1234567 (~Dec 25, 2025)"
 */
export function formatLedgerWithDate(
  ledger: number,
  baseLedger?: number,
  baseMs?: number
): string {
  const date = ledgerToDate(ledger, baseLedger, baseMs);
  const formatted = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${ledger.toLocaleString()} (~${formatted})`;
}

/**
 * Convert a Date to the nearest ledger number.
 */
export function dateToLedger(
  date: Date,
  baseLedger: number = BASE_LEDGER,
  baseMs: number = BASE_TIMESTAMP_MS
): number {
  const deltaMs = date.getTime() - baseMs;
  const deltaLedgers = Math.round(deltaMs / (LEDGER_INTERVAL_SECS * 1000));
  return baseLedger + deltaLedgers;
}

/**
 * Returns true if the current approximate time is past the given ledger.
 */
export function isPastLedger(
  targetLedger: number,
  baseLedger: number = BASE_LEDGER,
  baseMs: number = BASE_TIMESTAMP_MS
): boolean {
  return Date.now() > ledgerToDate(targetLedger, baseLedger, baseMs).getTime();
}
