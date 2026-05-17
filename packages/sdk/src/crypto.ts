// ─────────────────────────────────────────────────
// ECIES envelope (Node)
//
// Mirrors `app/src/lib/crypto.ts` envelope v1 so blobs encrypted by the
// CLI/MCP can be decrypted by the web app (and vice versa).
//
// Algorithm: ECDH P-256 + HKDF-SHA256 + AES-GCM-256.
//
// Uses Node's webcrypto (`globalThis.crypto.subtle`) which has been
// stable since Node 20. No native deps.
// ─────────────────────────────────────────────────

const ENVELOPE_VERSION = 1;
const ENVELOPE_ALG = "ECDH-P256+HKDF-SHA256+AES-GCM-256";
const KEY_DERIVATION_INFO = new TextEncoder().encode("scrolls/v1/submission");

export interface EncryptedEnvelope {
    v: number;
    alg: string;
    ephemeralPub: string;
    iv: string;
    ciphertext: string;
}

export interface FormKeypair {
    publicKeyJwk: JsonWebKey;
    privateKeyJwk: JsonWebKey;
}

const subtle = globalThis.crypto.subtle;

export async function generateFormKeypair(): Promise<FormKeypair> {
    const kp = await subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"],
    );
    const [publicKeyJwk, privateKeyJwk] = await Promise.all([
        subtle.exportKey("jwk", kp.publicKey),
        subtle.exportKey("jwk", kp.privateKey),
    ]);
    return { publicKeyJwk, privateKeyJwk };
}

export async function encryptForForm(
    plaintext: string,
    formPublicKeyJwk: JsonWebKey,
): Promise<EncryptedEnvelope> {
    const recipientPub = await subtle.importKey(
        "jwk",
        formPublicKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
    );
    const ephemeral = await subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"],
    );
    const aesKey = await deriveAesKey(ephemeral.privateKey, recipientPub);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(plaintext),
    );
    const ephemeralPubSpki = await subtle.exportKey("spki", ephemeral.publicKey);
    return {
        v: ENVELOPE_VERSION,
        alg: ENVELOPE_ALG,
        ephemeralPub: bytesToB64u(new Uint8Array(ephemeralPubSpki)),
        iv: bytesToB64u(iv),
        ciphertext: bytesToB64u(new Uint8Array(ciphertext)),
    };
}

export async function decryptForForm(
    envelope: EncryptedEnvelope,
    privateKeyJwk: JsonWebKey,
): Promise<string> {
    if (envelope.v !== ENVELOPE_VERSION || envelope.alg !== ENVELOPE_ALG) {
        throw new Error(`Unsupported envelope (v=${envelope.v}, alg=${envelope.alg})`);
    }
    const ownerPriv = await subtle.importKey(
        "jwk",
        privateKeyJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey", "deriveBits"],
    );
    const ephemeralPub = await subtle.importKey(
        "spki",
        b64uToBytes(envelope.ephemeralPub) as unknown as BufferSource,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
    );
    const aesKey = await deriveAesKey(ownerPriv, ephemeralPub);
    const plaintext = await subtle.decrypt(
        { name: "AES-GCM", iv: b64uToBytes(envelope.iv) as unknown as BufferSource },
        aesKey,
        b64uToBytes(envelope.ciphertext) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
}

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

async function deriveAesKey(
    privateKey: CryptoKey,
    publicKey: CryptoKey,
): Promise<CryptoKey> {
    const sharedBits = await subtle.deriveBits(
        { name: "ECDH", public: publicKey },
        privateKey,
        256,
    );
    const baseKey = await subtle.importKey(
        "raw",
        sharedBits,
        "HKDF",
        false,
        ["deriveKey"],
    );
    return subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(),
            info: KEY_DERIVATION_INFO,
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

// ── base64url helpers ────────────────────────────

function bytesToB64u(bytes: Uint8Array): string {
    // Node Buffer has built-in base64url support; fall back to manual conversion otherwise.
    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes).toString("base64url");
    }
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64uToBytes(b64u: string): Uint8Array {
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(b64u, "base64url"));
    }
    const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/")
        .padEnd(Math.ceil(b64u.length / 4) * 4, "=");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}
