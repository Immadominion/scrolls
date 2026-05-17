// Persistent CLI config stored at ~/.scrolls/config.json

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { ScrollsNetwork } from "@scrolls/sdk";

export interface CliConfig {
    network: ScrollsNetwork;
    suiPrivateKey?: string;
    walrusPublisher?: string;
    walrusAggregator?: string;
    walrusEpochs?: number;
    suiRpc?: string;
    scrollsPackage?: string;
    appUrl?: string;
}

export const CONFIG_DIR = join(homedir(), ".scrolls");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export async function readConfig(): Promise<CliConfig | null> {
    if (!existsSync(CONFIG_PATH)) return null;
    try {
        const raw = await readFile(CONFIG_PATH, "utf8");
        return JSON.parse(raw) as CliConfig;
    } catch {
        return null;
    }
}

export async function writeConfig(cfg: CliConfig): Promise<void> {
    if (!existsSync(CONFIG_DIR)) {
        await mkdir(CONFIG_DIR, { recursive: true });
    }
    await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
    // Protect the private key — owner-only read/write.
    await chmod(CONFIG_PATH, 0o600).catch(() => {});
}

/** Merge CLI flags onto the persistent config. CLI flags win. */
export function resolveConfig(
    file: CliConfig | null,
    overrides: Partial<CliConfig>,
): CliConfig {
    const base: CliConfig = file ?? { network: "testnet" };
    return {
        ...base,
        ...stripUndefined(overrides),
    };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    return out;
}
