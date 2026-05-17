// ─────────────────────────────────────────────────
// Contract addresses + Seal key-server topology
//
// Phase 1.5: the Move package is published, but only on testnet for the
// bounty milestone. Mainnet publish happens just before the production
// flip; until then the mainnet entries stay empty and the registry layer
// gracefully falls back to "local-only" mode (legacy localStorage indexes).
// ─────────────────────────────────────────────────

import { SCROLLS_NETWORK } from "./dapp-kit";

export type ScrollsNetwork = typeof SCROLLS_NETWORK;

/** scrolls Move package ids per network. Empty string = not yet deployed. */
export const SCROLLS_PACKAGES: Record<ScrollsNetwork, string> = {
    devnet: "",
    testnet: "0x6418bc0c11e75ef443f7e8fedb9a860b6cc3bfe5909481dc309472ad8b7b10a0",
    mainnet: "0xbd376f7ee099f1b91b52c00dc4f5b3f8535bffd02b44baa2f9aba225abe64d95",
};

/** Seal verifier package addresses (from Mysten Labs). */
export const SEAL_PACKAGES: Record<ScrollsNetwork, string> = {
    devnet: "",
    testnet: "0x4016869413374eaa71df2a043d1660ed7bc927ab7962831f8b07efbc7efdb2c3",
    mainnet: "0xcb83a248bda5f7a0a431e6bf9e96d184e604130ec5218696e3f1211113b447b7",
};

/**
 * Curated key servers for Seal. Threshold 2-of-N keeps the system live if
 * any single server is down without giving any single party the full key.
 *
 * Testnet uses one Mysten-operated server + the decentralized aggregator
 * server; mainnet topology is left for the production flip.
 */
export interface SealKeyServer {
    objectId: string;
    weight: number;
    /** Required for committee-mode (decentralized) servers. */
    aggregatorUrl?: string;
}

export const SEAL_KEY_SERVERS: Record<ScrollsNetwork, SealKeyServer[]> = {
    devnet: [],
    testnet: [
        { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
        { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
    ],
    mainnet: [],
};

export const SEAL_THRESHOLD: Record<ScrollsNetwork, number> = {
    devnet: 1,
    testnet: 2,
    mainnet: 2,
};

/** Sui JSON-RPC endpoint per network. Used for event queries / object reads. */
export const SUI_RPC_URLS: Record<ScrollsNetwork, string> = {
    devnet: "https://fullnode.devnet.sui.io:443",
    testnet: "https://fullnode.testnet.sui.io:443",
    mainnet: "https://fullnode.mainnet.sui.io:443",
};

export const SCROLLS_PACKAGE = SCROLLS_PACKAGES[SCROLLS_NETWORK];
export const SEAL_PACKAGE = SEAL_PACKAGES[SCROLLS_NETWORK];
export const SUI_RPC_URL = SUI_RPC_URLS[SCROLLS_NETWORK];

/** Per-network resolved Seal config, picked once at module load. */
export const SEAL_KEY_SERVERS_RESOLVED: SealKeyServer[] = SEAL_KEY_SERVERS[SCROLLS_NETWORK];
export const SEAL_THRESHOLD_RESOLVED: number = SEAL_THRESHOLD[SCROLLS_NETWORK];

/** Returns true when the on-chain registry is available on the current network. */
export function hasOnchainRegistry(): boolean {
    return SCROLLS_PACKAGE.length > 0;
}

/** Returns true when Seal is available on the current network. */
export function hasSeal(): boolean {
    return SEAL_PACKAGE.length > 0 && SEAL_KEY_SERVERS[SCROLLS_NETWORK].length > 0;
}
