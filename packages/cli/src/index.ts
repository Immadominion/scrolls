#!/usr/bin/env node
// `scrolls` — the Scrolls command-line.
//
// Subcommands:
//   init           interactive config wizard
//   create <spec>  publish a form (YAML or JSON)
//   list           list forms for the configured signer
//   get <id>       fetch a form's config
//   submissions <id> list submissions (with --key to decrypt)
//   export <id>    dump submissions as CSV
//   submit <id> <file> submit responses from a JSON file
//
// Common flags (apply to every command except `init`):
//   --network <testnet|mainnet|devnet>
//   --private-key <suiprivkey1…>
//   --publisher <url>      Walrus publisher
//   --aggregator <url>     Walrus aggregator
//   --rpc <url>            Sui RPC URL
//   --pkg <0x…>            Scrolls Move package id
//   --epochs <n>           Walrus epochs to store (default 53)
//   --app-url <url>        Scrolls web app base for share URLs

import { Command, Option } from "commander";
import { runInit } from "./commands/init.js";
import { runCreate } from "./commands/create.js";
import { runList } from "./commands/list.js";
import { runGet } from "./commands/get.js";
import { runSubmissions } from "./commands/submissions.js";
import { runExport } from "./commands/export.js";
import { runSubmit } from "./commands/submit.js";

const program = new Command();

program
    .name("scrolls")
    .description("Walrus-native forms from your terminal.")
    .version("0.1.0");

// Shared options reused on every sub-command.
function addCommonOptions<T extends Command>(cmd: T): T {
    return cmd
        .addOption(
            new Option("--network <name>", "testnet | mainnet | devnet").choices([
                "testnet",
                "mainnet",
                "devnet",
            ]),
        )
        .option("--private-key <key>", "Sui ed25519 private key (suiprivkey1…)")
        .option("--publisher <url>", "Walrus publisher URL")
        .option("--aggregator <url>", "Walrus aggregator URL")
        .option("--rpc <url>", "Sui RPC URL")
        .option("--pkg <id>", "Scrolls Move package id")
        .option("--epochs <n>", "Walrus storage epochs", (v) => Number(v))
        .option("--app-url <url>", "Scrolls web app base URL");
}

program
    .command("init")
    .description("Set up ~/.scrolls/config.json")
    .action(() => runInit().catch(panic));

addCommonOptions(
    program
        .command("create <spec>")
        .description("Publish a form from a YAML or JSON spec file"),
)
    .option("--key-out <path>", "Where to write the decryption key for private forms")
    .option("--json", "Emit machine-readable JSON only")
    .action((spec: string, opts: Record<string, unknown>) =>
        runCreate(spec, opts as Parameters<typeof runCreate>[1]).catch(panic),
    );

addCommonOptions(program.command("list").description("List forms for the configured signer"))
    .option("--address <0x…>", "List forms for a specific Sui address")
    .option("--json", "Emit JSON only")
    .action((opts: Record<string, unknown>) =>
        runList(opts as Parameters<typeof runList>[0]).catch(panic),
    );

addCommonOptions(program.command("get <formId>").description("Fetch a form config"))
    .option("--json", "Emit JSON only")
    .action((formId: string, opts: Record<string, unknown>) =>
        runGet(formId, opts as Parameters<typeof runGet>[1]).catch(panic),
    );

addCommonOptions(
    program
        .command("submissions <formId>")
        .description("List submissions (use --key to decrypt private forms)"),
)
    .option("--key <path>", "Path to the decryption key JSON")
    .option("--limit <n>", "Max submissions to fetch", (v) => Number(v))
    .option("--json", "Emit JSON only")
    .action((formId: string, opts: Record<string, unknown>) =>
        runSubmissions(formId, opts as Parameters<typeof runSubmissions>[1]).catch(panic),
    );

addCommonOptions(program.command("export <formId>").description("Export submissions as CSV"))
    .option("--key <path>", "Path to the decryption key JSON")
    .option("--out <path>", "Write CSV to a file instead of stdout")
    .action((formId: string, opts: Record<string, unknown>) =>
        runExport(formId, opts as Parameters<typeof runExport>[1]).catch(panic),
    );

addCommonOptions(
    program
        .command("submit <formId> <responsesFile>")
        .description("Submit responses from a JSON file"),
)
    .option("--json", "Emit JSON only")
    .action((formId: string, file: string, opts: Record<string, unknown>) =>
        runSubmit(formId, file, opts as Parameters<typeof runSubmit>[2]).catch(panic),
    );

program.parseAsync(process.argv);

function panic(err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  ✗ ${msg}\n`);
    process.exit(1);
}
