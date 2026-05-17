// `scrolls init` — interactive config writer.

import prompts from "prompts";
import type { ScrollsNetwork } from "@scrolls/sdk";
import { loadKeypair } from "@scrolls/sdk";
import { CONFIG_PATH, readConfig, writeConfig } from "../config.js";
import { banner, bold, dim, info, ok, fail, kv, violet } from "../ui.js";

export async function runInit(): Promise<void> {
    banner();
    console.log("");
    console.log(`  ${bold("Set up your Scrolls CLI.")}`);
    console.log(`  ${dim("Your config will be saved to")} ${dim(CONFIG_PATH)}`);
    console.log("");

    const existing = await readConfig();

    const answers = await prompts(
        [
            {
                type: "select",
                name: "network",
                message: "Which network?",
                initial: existing?.network === "mainnet" ? 1 : 0,
                choices: [
                    { title: "testnet — recommended for trying things out", value: "testnet" },
                    { title: "mainnet — real Walrus storage, real SUI", value: "mainnet" },
                ],
            },
            {
                type: "password",
                name: "suiPrivateKey",
                message:
                    "Sui private key (suiprivkey1…) — optional, only needed for on-chain publishing",
                initial: existing?.suiPrivateKey ?? "",
            },
        ],
        { onCancel: () => fail("Cancelled.") },
    );

    if (answers.suiPrivateKey) {
        try {
            const kp = loadKeypair(answers.suiPrivateKey);
            info(`Detected Sui address: ${kp.toSuiAddress()}`);
        } catch (err) {
            fail(`Invalid Sui private key: ${(err as Error).message}`);
        }
    }

    await writeConfig({
        network: answers.network as ScrollsNetwork,
        suiPrivateKey: answers.suiPrivateKey || undefined,
    });

    console.log("");
    ok("Config saved.");
    kv("Path", CONFIG_PATH);
    kv("Network", answers.network);
    console.log("");
    console.log(
        `  Next: ${violet("scrolls create <spec.yaml>")} ${dim("to publish your first form.")}`,
    );
}
