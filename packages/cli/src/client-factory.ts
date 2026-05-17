// Build a ScrollsClient from the persistent config + CLI flag overrides.

import { ScrollsClient, type ScrollsNetwork } from "@scrolls/sdk";
import { readConfig, resolveConfig, type CliConfig } from "./config.js";
import { fail } from "./ui.js";

export interface ClientFlags {
    network?: ScrollsNetwork;
    privateKey?: string;
    publisher?: string;
    aggregator?: string;
    rpc?: string;
    pkg?: string;
    epochs?: number;
    appUrl?: string;
}

export async function buildClient(flags: ClientFlags = {}): Promise<{
    client: ScrollsClient;
    config: CliConfig;
}> {
    const fileCfg = await readConfig();
    const config = resolveConfig(fileCfg, {
        network: flags.network,
        suiPrivateKey: flags.privateKey,
        walrusPublisher: flags.publisher,
        walrusAggregator: flags.aggregator,
        suiRpc: flags.rpc,
        scrollsPackage: flags.pkg,
        walrusEpochs: flags.epochs,
        appUrl: flags.appUrl,
    });

    if (!config.network) {
        fail("No network configured. Run `scrolls init`.");
    }

    const client = new ScrollsClient({
        network: config.network,
        suiPrivateKey: config.suiPrivateKey,
        walrusPublisher: config.walrusPublisher,
        walrusAggregator: config.walrusAggregator,
        walrusEpochs: config.walrusEpochs,
        suiRpc: config.suiRpc,
        scrollsPackage: config.scrollsPackage,
        appUrl: config.appUrl,
    });

    return { client, config };
}
