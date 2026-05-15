// ─────────────────────────────────────────────────
// Sui helpers
//
// On-chain registration of forms/submissions is not yet implemented —
// it is gated behind a Move contract that will land in a follow-up
// milestone. Until then, form/submission discovery uses the local-first
// indexes in `formIndex.ts` and `submissionIndex.ts`. The MVP form-fill
// flow does not depend on Sui at all: form ID == Walrus blob ID, so
// `/f?id=<blobId>` resolves directly via the Walrus aggregator.
// ─────────────────────────────────────────────────

/** Truncate a Sui address for display: 0x1234…5678 */
export function truncateAddress(addr: string): string {
    if (!addr) return "";
    if (addr.length < 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Validate a Sui address format (32-byte hex with 0x prefix) */
export function isValidSuiAddress(addr: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(addr);
}
