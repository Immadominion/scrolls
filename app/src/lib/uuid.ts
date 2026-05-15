// ─────────────────────────────────────────────────
// UUID helpers
//
// `crypto.randomUUID()` is only exposed in *secure contexts* (HTTPS or
// localhost). When users open a Scrolls form over plain HTTP on a LAN IP
// — or via some legacy mobile browsers — `crypto.randomUUID` is
// `undefined` and submission breaks with:
//
//     crypto.randomUUID is not a function
//
// `crypto.getRandomValues` is, however, available in *every* context
// where `crypto` exists, so we can safely synthesise an RFC 4122 v4
// UUID from 16 random bytes. This wrapper prefers the native
// implementation when available and falls back to the manual one
// otherwise. Use this everywhere instead of calling `crypto.randomUUID`
// directly.
// ─────────────────────────────────────────────────

export function randomUUID(): string {
    if (typeof crypto !== "undefined") {
        if (typeof crypto.randomUUID === "function") {
            try {
                return crypto.randomUUID();
            } catch {
                // Fall through to manual path.
            }
        }

        if (typeof crypto.getRandomValues === "function") {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            // Per RFC 4122 §4.4: set version (4) and variant (10xx).
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex: string[] = [];
            for (let i = 0; i < bytes.length; i += 1) {
                hex.push(bytes[i].toString(16).padStart(2, "0"));
            }
            return (
                `${hex.slice(0, 4).join("")}-` +
                `${hex.slice(4, 6).join("")}-` +
                `${hex.slice(6, 8).join("")}-` +
                `${hex.slice(8, 10).join("")}-` +
                `${hex.slice(10, 16).join("")}`
            );
        }
    }

    // Last-resort fallback — Math.random is not cryptographically secure
    // but UUIDs in this codebase are used as opaque IDs, not secrets.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
