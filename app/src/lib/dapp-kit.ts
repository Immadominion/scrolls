// ─────────────────────────────────────────────────
// dApp Kit instance — single source of truth
//
// Uses the latest @mysten/dapp-kit-react (NOT the legacy package).
// Network is read from NEXT_PUBLIC_SUI_NETWORK so the same build works
// on devnet/testnet/mainnet by changing one env var.
// ─────────────────────────────────────────────────

import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";

type ScrollsNetwork = "devnet" | "testnet" | "mainnet";

const NETWORK: ScrollsNetwork =
    (process.env.NEXT_PUBLIC_SUI_NETWORK as ScrollsNetwork | undefined) ?? "testnet";

const GRPC_URLS: Record<ScrollsNetwork, string> = {
    devnet: "https://fullnode.devnet.sui.io:443",
    testnet: "https://fullnode.testnet.sui.io:443",
    mainnet: "https://fullnode.mainnet.sui.io:443",
};

function createScrollsDAppKit() {
    return createDAppKit({
        networks: [NETWORK],
        defaultNetwork: NETWORK,
        createClient: (network) =>
            new SuiGrpcClient({
                network,
                baseUrl: GRPC_URLS[network as ScrollsNetwork],
            }),
        // The default Slush web initializer registers immediately and can
        // trigger network work during app startup. Scrolls uses extension
        // wallets through the standard wallet registry instead.
        slushWalletConfig: null,
    });
}

export type ScrollsDAppKit = ReturnType<typeof createScrollsDAppKit>;

let dAppKitInstance: ScrollsDAppKit | null = null;

export function getDAppKit(): ScrollsDAppKit {
    if (!dAppKitInstance) {
        dAppKitInstance = createScrollsDAppKit();
    }

    return dAppKitInstance;
}

// Type registration for hook inference
declare module "@mysten/dapp-kit-react" {
    interface Register {
        dAppKit: ScrollsDAppKit;
    }
}

export const SCROLLS_NETWORK = NETWORK;
