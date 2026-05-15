// ─────────────────────────────────────────────────
// Scrolls — Seal access-controlled encryption adapter
//
// Wraps `@mysten/seal` for the Scrolls access pattern: one shared
// `FormPolicy` Move object per private form, owner + admins authorised
// via the `seal_approve_decrypt` entry function in
// `move/scrolls/sources/seal_policy.move`.
//
// Why this layer exists (instead of calling SealClient directly):
//   • Co-locate envelope versioning so the responses viewer can route
//     v1 (legacy ECIES) and v2 (Seal) submissions through one path.
//   • Cache a single SealClient instance (the SDK caches key-server
//     metadata + derived keys across calls, so reuse matters).
//   • Cache the SessionKey across decrypts within the same browser
//     session so admins approve once per ttl, not once per response.
// ─────────────────────────────────────────────────

import { SealClient, SessionKey } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";

import {
    SCROLLS_PACKAGE,
    SEAL_KEY_SERVERS_RESOLVED,
    SEAL_THRESHOLD_RESOLVED,
    SUI_RPC_URL,
    hasOnchainRegistry,
    hasSeal,
} from "./contracts";
import { SCROLLS_NETWORK } from "./dapp-kit";
import { bytesToB64u, b64uToBytes } from "./crypto";

/**
 * Versioned envelope written to Walrus for private submissions. v1 is
 * the legacy ECIES envelope (still readable for old data); v2 is Seal
 * threshold encryption gated by an on-chain FormPolicy.
 */
export interface SealEnvelopeV2 {
    v: 2;
    alg: "SEAL";
    /** base64url BCS-serialised EncryptedObject from `@mysten/seal`. */
    encryptedObject: string;
    /** Sui object id (hex, 0x-prefixed) of the FormPolicy used. */
    policyId: string;
}

/** Type guard. */
export function isSealEnvelope(parsed: unknown): parsed is SealEnvelopeV2 {
    if (!parsed || typeof parsed !== "object") return false;
    const e = parsed as Partial<SealEnvelopeV2>;
    return e.v === 2 && e.alg === "SEAL" && typeof e.encryptedObject === "string" && typeof e.policyId === "string";
}

/**
 * Strip a leading 0x and return the hex string the Seal SDK expects.
 * `@mysten/bcs`'s `fromHex` (called inside the SDK) accepts both, but
 * being explicit avoids drift if their behaviour ever changes.
 */
function bareHex(hex: string): string {
    return hex.startsWith("0x") ? hex.slice(2) : hex;
}

// ── SealClient (memoised) ───────────────────────────────────────────

let _sui: SuiJsonRpcClient | null = null;
let _sealClient: SealClient | null = null;

function suiClient(): SuiJsonRpcClient {
    if (!_sui) {
        _sui = new SuiJsonRpcClient({ url: SUI_RPC_URL, network: SCROLLS_NETWORK });
    }
    return _sui;
}

function sealClient(): SealClient {
    if (!hasSeal()) {
        throw new Error(
            `Seal is not configured for ${SCROLLS_NETWORK}. ` +
            "Set SEAL_PACKAGES + SEAL_KEY_SERVERS in lib/contracts.ts.",
        );
    }
    if (!hasOnchainRegistry()) {
        throw new Error(
            `Scrolls Move package is not deployed on ${SCROLLS_NETWORK} \u2014 ` +
            "private forms require the on-chain policy module.",
        );
    }
    if (!_sealClient) {
        _sealClient = new SealClient({
            // SealClient's SealCompatibleClient is `ClientWithExtensions<{core: CoreClient}>`.
            // Both SuiJsonRpcClient and SuiGrpcClient expose `.core` — the cast keeps the
            // import light without pulling the dapp-kit grpc client in here.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            suiClient: suiClient() as any,
            serverConfigs: SEAL_KEY_SERVERS_RESOLVED.map((s) => ({
                objectId: s.objectId,
                weight: s.weight,
                ...(s.aggregatorUrl ? { aggregatorUrl: s.aggregatorUrl } : {}),
            })),
            // App-startup verification adds two round-trips per key server.
            // We pin the object IDs in code (lib/contracts.ts) which already
            // means we trust the source they came from — verifying again
            // online buys nothing here.
            verifyKeyServers: false,
        });
    }
    return _sealClient;
}

// ── Encryption ──────────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 string for the given form policy.
 * Returns a fully-formed v2 envelope ready for JSON serialisation.
 *
 * Encryption is non-interactive: no wallet popup. The Seal SDK fetches
 * key-server public keys from chain (cached) and derives the threshold
 * shares locally.
 */
export async function encryptToPolicy(
    policyId: string,
    plaintext: string,
): Promise<SealEnvelopeV2> {
    const data = new TextEncoder().encode(plaintext);
    const { encryptedObject } = await sealClient().encrypt({
        threshold: SEAL_THRESHOLD_RESOLVED,
        packageId: bareHex(SCROLLS_PACKAGE),
        id: bareHex(policyId),
        data,
    });
    return {
        v: 2,
        alg: "SEAL",
        encryptedObject: bytesToB64u(encryptedObject),
        policyId,
    };
}

// ── Decryption ──────────────────────────────────────────────────────

/**
 * Cached per-(address,policyId) SessionKey. Reuses the wallet
 * personal-message signature for the configured ttl so admins aren't
 * prompted on every row expand in the responses viewer.
 */
const _sessionCache = new Map<string, SessionKey>();
const SESSION_TTL_MIN = 30;

interface SignPersonalMessageLike {
    signPersonalMessage: (args: {
        message: Uint8Array;
    }) => Promise<{ signature: string }>;
}

async function getSessionKey(
    dAppKit: SignPersonalMessageLike,
    address: string,
): Promise<SessionKey> {
    const key = `${address}::${SCROLLS_PACKAGE}`;
    const existing = _sessionCache.get(key);
    if (existing && !existing.isExpired()) return existing;

    const sk = await SessionKey.create({
        address,
        packageId: bareHex(SCROLLS_PACKAGE),
        ttlMin: SESSION_TTL_MIN,
        // SealCompatibleClient cast — same reason as in sealClient().
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        suiClient: suiClient() as any,
    });
    const message = sk.getPersonalMessage();
    const { signature } = await dAppKit.signPersonalMessage({ message });
    await sk.setPersonalMessageSignature(signature);
    _sessionCache.set(key, sk);
    return sk;
}

/** Forget any cached session keys — call on wallet disconnect. */
export function clearSealSessionCache(): void {
    _sessionCache.clear();
}

/**
 * Decrypt a v2 Seal envelope. Pops the wallet for the personal-message
 * signature once per `SESSION_TTL_MIN` minutes per address.
 *
 * Throws if the signer's address is not the policy owner / admin
 * (caught by the `seal_approve_decrypt` move function during the
 * dry-run on the key servers).
 */
export async function decryptFromPolicy(
    envelope: SealEnvelopeV2,
    dAppKit: SignPersonalMessageLike,
    address: string,
): Promise<string> {
    const data = b64uToBytes(envelope.encryptedObject);

    const sessionKey = await getSessionKey(dAppKit, address);

    // The transaction for Seal evaluation must call ONLY seal_approve*
    // functions, all in the same package. Our policy hook expects:
    //   id: vector<u8>           (the 32-byte FormPolicy object id)
    //   policy: &FormPolicy      (shared object reference)
    //   ctx: &TxContext
    const policyIdBytes = fromHex(bareHex(envelope.policyId));
    const tx = new Transaction();
    tx.moveCall({
        target: `${SCROLLS_PACKAGE}::seal_policy::seal_approve_decrypt`,
        arguments: [
            tx.pure.vector("u8", Array.from(policyIdBytes)),
            tx.object(envelope.policyId),
        ],
    });
    const txBytes = await tx.build({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: suiClient() as any,
        onlyTransactionKind: true,
    });

    const decrypted = await sealClient().decrypt({ data, sessionKey, txBytes });
    return new TextDecoder().decode(decrypted);
}
