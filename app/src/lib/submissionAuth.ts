// ─────────────────────────────────────────────────────────────────────
// Wallet-bound submission attestation.
//
// When a respondent has a connected Sui wallet we ask the wallet to sign
// the SHA-256 digest of the canonical submission JSON via
// `signPersonalMessage`. The returned signature + claimed address is
// stored alongside the submission. On the responses viewer we verify
// the signature against the digest using
// `verifyPersonalMessageSignature` from `@mysten/sui/verify` and refuse
// to accept a "verified" badge unless the recovered address matches the
// claimed `submitterAddress`.
//
// Anonymous submissions remain fully supported — the signature object
// is simply absent.
// ─────────────────────────────────────────────────────────────────────

import { verifyPersonalMessageSignature } from "@mysten/sui/verify";

export interface SubmissionSignature {
    /** SHA-256 digest of the canonical submission JSON, base64url. */
    digest: string;
    /** `signPersonalMessage` output (Sui serialised signature, base64). */
    signature: string;
    /** Claimed Sui address of the signer. */
    address: string;
}

const SIGNED_PREFIX = "scrolls/submission/v1\n";
const encoder = new TextEncoder();

/**
 * Build the bytes the wallet should sign. Includes a domain prefix to
 * prevent cross-protocol signature reuse and binds the signature to the
 * specific form ID + submission digest.
 */
export function buildSignedMessage(formId: string, digestB64u: string): Uint8Array {
    return encoder.encode(`${SIGNED_PREFIX}form=${formId}\ndigest=${digestB64u}`);
}

/** SHA-256 → base64url (no padding) of the canonical submission JSON. */
export async function digestSubmission(canonicalJson: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalJson));
    return bytesToB64u(new Uint8Array(buf));
}

/**
 * Verify a signature was produced by `address` for `(formId, digest)`.
 * Returns true only if the signature is valid AND recovers to the
 * claimed address.
 */
export async function verifySubmissionSignature(
    formId: string,
    sig: SubmissionSignature,
): Promise<boolean> {
    try {
        const message = buildSignedMessage(formId, sig.digest);
        const publicKey = await verifyPersonalMessageSignature(message, sig.signature, {
            address: sig.address,
        });
        return publicKey.toSuiAddress() === sig.address;
    } catch {
        return false;
    }
}

// base64url helpers (no padding, URL-safe alphabet)
function bytesToB64u(bytes: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
