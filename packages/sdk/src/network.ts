// ─────────────────────────────────────────────────
// Network defaults
//
// Mirrors `app/src/lib/contracts.ts` so a SDK consumer doesn't have to
// look anything up to get started. Keep these in sync with the web
// app's contract addresses.
// ─────────────────────────────────────────────────

import type { NetworkConfig, ScrollsNetwork } from "./types.js";

export const DEFAULT_PUBLISHERS: Record<ScrollsNetwork, string> = {
    testnet: "https://publisher.walrus-testnet.walrus.space",
    mainnet: "https://publisher.walrus-mainnet.walrus.space",
    devnet: "https://publisher.walrus-testnet.walrus.space",
};

export const DEFAULT_AGGREGATORS: Record<ScrollsNetwork, string> = {
    testnet: "https://aggregator.walrus-testnet.walrus.space",
    mainnet: "https://aggregator.walrus-mainnet.walrus.space",
    devnet: "https://aggregator.walrus-testnet.walrus.space",
};

export const DEFAULT_SUI_RPC: Record<ScrollsNetwork, string> = {
    testnet: "https://fullnode.testnet.sui.io:443",
    mainnet: "https://fullnode.mainnet.sui.io:443",
    devnet: "https://fullnode.devnet.sui.io:443",
};

export const DEFAULT_PACKAGES: Record<ScrollsNetwork, string> = {
    testnet: "0x6418bc0c11e75ef443f7e8fedb9a860b6cc3bfe5909481dc309472ad8b7b10a0",
    mainnet: "",
    devnet: "",
};

export const DEFAULT_APP_URLS: Record<ScrollsNetwork, string> = {
    testnet: "https://scrolls.wal.app",
    mainnet: "https://scrolls.wal.app",
    devnet: "https://scrolls.wal.app",
};

export const DEFAULT_EPOCHS = 53;

export function resolveNetworkConfig(
    network: ScrollsNetwork,
    overrides: Partial<NetworkConfig> = {},
): NetworkConfig {
    return {
        network,
        walrusPublisher: overrides.walrusPublisher ?? DEFAULT_PUBLISHERS[network],
        walrusAggregator: overrides.walrusAggregator ?? DEFAULT_AGGREGATORS[network],
        walrusEpochs: overrides.walrusEpochs ?? DEFAULT_EPOCHS,
        suiRpc: overrides.suiRpc ?? DEFAULT_SUI_RPC[network],
        scrollsPackage: overrides.scrollsPackage ?? DEFAULT_PACKAGES[network],
        suiPrivateKey: overrides.suiPrivateKey,
        appUrl: overrides.appUrl ?? DEFAULT_APP_URLS[network],
    };
}
