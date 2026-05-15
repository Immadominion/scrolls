// ─────────────────────────────────────────────────────────────────────
// End-to-end encryption for private form submissions.
//
// Algorithm: ECIES-style envelope.
//   • Form owner holds an ECDH P-256 keypair. Public key lives in the
//     FormConfig blob on Walrus; private key lives in the owner's
//     browser localStorage (downloadable backup file).
//   • Each respondent generates an ephemeral ECDH keypair, derives a
//     shared secret with the form's public key, then HKDF-SHA256
//     derives an AES-GCM-256 key. The submission is encrypted with a
//     fresh 12-byte IV.
//   • The Walrus blob stores { v, alg, ephemeralPub, iv, ciphertext }
//     — all base64url. The form owner reverses the ECDH on decrypt.
//
// Why Web Crypto (not @mysten/seal): real Seal requires a deployed Move
// package with seal_approve* functions and key-server registration —
// that's the Phase 2 access-control layer. This module gives Phase 1
// genuine end-to-end confidentiality with zero on-chain dependencies.
// Phase 2 will migrate the privacy primitive to Seal for richer
// policies (allowlists, time-locks, sponsored decryption).
// ─────────────────────────────────────────────────────────────────────

const ENVELOPE_VERSION = 1;
const ENVELOPE_ALG = "ECDH-P256+HKDF-SHA256+AES-GCM-256";
const KEY_DERIVATION_INFO = new TextEncoder().encode("scrolls/v1/submission");

export interface EncryptedEnvelope {
    v: number;
    alg: string;
    ephemeralPub: string;   // base64url SPKI
    iv: string;             // base64url, 12 bytes
    ciphertext: string;     // base64url
}

export interface FormKeypair {
    publicKeyJwk: JsonWebKey;
    privateKeyJwk: JsonWebKey;
}

// ── Public API ───────────────────────────────────────────────────────

/** Generate a fresh form-owner ECDH P-256 keypair (extractable). */
export async function generateFormKeypair(): Promise<FormKeypair> {
    const kp = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"],
    );
    const [publicKeyJwk, privateKeyJwk] = await Promise.all([
        crypto.subtle.exportKey("jwk", kp.publicKey),
        crypto.subtle.exportKey("jwk", kp.privateKey),
    ]);
    return { publicKeyJwk, privateKeyJwk };
}

/**
 * Encrypt a UTF-8 string for a given form public key.
 * Returns a JSON-serialisable envelope ready for Walrus upload.
 */
export async function encryptForForm(
    plaintext: string,
    formPublicKeyJwk: JsonWebKey,
): Promise<EncryptedEnvelope> {
    const recipientPub = await crypto.subtle.importKey(
        "jwk",
        formPublicKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
    );

    const ephemeral = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"],
    );

    const aesKey = await deriveAesKey(ephemeral.privateKey, recipientPub);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(plaintext),
    );

    const ephemeralPubSpki = await crypto.subtle.exportKey("spki", ephemeral.publicKey);

    return {
        v: ENVELOPE_VERSION,
        alg: ENVELOPE_ALG,
        ephemeralPub: bytesToB64u(new Uint8Array(ephemeralPubSpki)),
        iv: bytesToB64u(iv),
        ciphertext: bytesToB64u(new Uint8Array(ciphertext)),
    };
}

/**
 * Decrypt an envelope using the form owner's private key.
 * Throws if the envelope is malformed or the key doesn't match.
 */
export async function decryptForForm(
    envelope: EncryptedEnvelope,
    privateKeyJwk: JsonWebKey,
): Promise<string> {
    if (envelope.v !== ENVELOPE_VERSION || envelope.alg !== ENVELOPE_ALG) {
        throw new Error(`Unsupported envelope (v=${envelope.v}, alg=${envelope.alg})`);
    }

    const ownerPriv = await crypto.subtle.importKey(
        "jwk",
        privateKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey", "deriveBits"],
    );
    return decryptForFormWithCryptoKey(envelope, ownerPriv);
}

/**
 * Decrypt an envelope using a `CryptoKey` already loaded from a
 * hardened (IndexedDB) store. Avoids round-tripping through JWK so the
 * private bytes never need to be exposed to JavaScript.
 */
export async function decryptForFormWithCryptoKey(
    envelope: EncryptedEnvelope,
    ownerPrivateKey: CryptoKey,
): Promise<string> {
    if (envelope.v !== ENVELOPE_VERSION || envelope.alg !== ENVELOPE_ALG) {
        throw new Error(`Unsupported envelope (v=${envelope.v}, alg=${envelope.alg})`);
    }

    const ephemeralPub = await crypto.subtle.importKey(
        "spki",
        b64uToBytes(envelope.ephemeralPub),
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
    );

    const aesKey = await deriveAesKey(ownerPrivateKey, ephemeralPub);

    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64uToBytes(envelope.iv) },
        aesKey,
        b64uToBytes(envelope.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
}

/** Type guard — does this JSON look like an EncryptedEnvelope? */
export function isEncryptedEnvelope(x: unknown): x is EncryptedEnvelope {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
        typeof o.v === "number" &&
        typeof o.alg === "string" &&
        typeof o.ephemeralPub === "string" &&
        typeof o.iv === "string" &&
        typeof o.ciphertext === "string"
    );
}

// ── Local key storage (form-owner side) ──────────────────────────────

const KEY_PREFIX = "scrolls:formkey:";

export function storeFormPrivateKey(formId: string, jwk: JsonWebKey): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY_PREFIX + formId, JSON.stringify(jwk));
}

export function loadFormPrivateKey(formId: string): JsonWebKey | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY_PREFIX + formId);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as JsonWebKey;
    } catch {
        return null;
    }
}

export function removeFormPrivateKey(formId: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(KEY_PREFIX + formId);
}

/**
 * Build the JSON content of a downloadable key backup.
 * Owner saves this — losing it means losing access to encrypted responses.
 */
export function buildKeyBackup(
    formId: string,
    title: string,
    privateKeyJwk: JsonWebKey,
): string {
    return JSON.stringify(
        {
            scrolls: "form-decryption-key",
            version: 1,
            formId,
            title,
            createdAt: new Date().toISOString(),
            warning:
                "Keep this file secret. Anyone holding it can decrypt every response submitted to this form.",
            privateKeyJwk,
        },
        null,
        2,
    );
}

/**
 * Parse a previously downloaded backup file. Returns the embedded JWK
 * if it matches the expected formId; throws otherwise.
 */
export function parseKeyBackup(text: string, expectedFormId: string): JsonWebKey {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Backup file is not valid JSON.");
    }
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Backup file is malformed.");
    }
    const o = parsed as Record<string, unknown>;
    if (o.scrolls !== "form-decryption-key") {
        throw new Error("This file is not a Scrolls decryption key backup.");
    }
    if (typeof o.formId !== "string" || o.formId !== expectedFormId) {
        throw new Error("Backup is for a different form.");
    }
    if (!o.privateKeyJwk || typeof o.privateKeyJwk !== "object") {
        throw new Error("Backup is missing the private key.");
    }
    return o.privateKeyJwk as JsonWebKey;
}

// ── Internals ────────────────────────────────────────────────────────

async function deriveAesKey(
    ownPrivate: CryptoKey,
    peerPublic: CryptoKey,
): Promise<CryptoKey> {
    // 1. ECDH → 32-byte shared secret
    const sharedBits = await crypto.subtle.deriveBits(
        { name: "ECDH", public: peerPublic },
        ownPrivate,
        256,
    );
    // 2. HKDF-SHA256 → AES-GCM key (no salt; info binds the key to this protocol)
    const hkdfMaterial = await crypto.subtle.importKey(
        "raw",
        sharedBits,
        "HKDF",
        false,
        ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(0),
            info: KEY_DERIVATION_INFO,
        },
        hkdfMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

// base64url helpers — no padding, URL-safe alphabet
export function bytesToB64u(bytes: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uToBytes(s: string): Uint8Array<ArrayBuffer> {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const buf = new ArrayBuffer(bin.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
