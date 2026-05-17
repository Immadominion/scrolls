#!/usr/bin/env node

// src/index.ts
import { Command, Option } from "commander";

// src/commands/init.ts
import prompts from "prompts";
import { loadKeypair } from "@scrolls/sdk";

// src/config.ts
import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile, chmod } from "fs/promises";
import { existsSync } from "fs";
var CONFIG_DIR = join(homedir(), ".scrolls");
var CONFIG_PATH = join(CONFIG_DIR, "config.json");
async function readConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function writeConfig(cfg) {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  await chmod(CONFIG_PATH, 384).catch(() => {
  });
}
function resolveConfig(file, overrides) {
  const base = file ?? { network: "testnet" };
  return {
    ...base,
    ...stripUndefined(overrides)
  };
}
function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== void 0) out[k] = v;
  }
  return out;
}

// src/ui.ts
import pc from "picocolors";
var violet = (s) => pc.magenta(s);
var cyan = (s) => pc.cyan(s);
var dim = (s) => pc.dim(s);
var bold = (s) => pc.bold(s);
var red = (s) => pc.red(s);
var green = (s) => pc.green(s);
var yellow = (s) => pc.yellow(s);
function banner() {
  console.log(`${violet(bold("\u2726 scrolls"))} ${dim("\xB7")} ${dim("walrus-native forms")}`);
}
function ok(msg) {
  console.log(`${green("\u2713")} ${msg}`);
}
function info(msg) {
  console.log(`${cyan("\xB7")} ${msg}`);
}
function warn(msg) {
  console.log(`${yellow("!")} ${msg}`);
}
function fail(msg) {
  console.error(`${red("\u2717")} ${msg}`);
  process.exit(1);
}
function kv(label, value) {
  console.log(`  ${dim(label.padEnd(14))} ${value}`);
}
function truncate(s, n = 12) {
  if (s.length <= n * 2 + 1) return s;
  return `${s.slice(0, n)}\u2026${s.slice(-4)}`;
}

// src/commands/init.ts
async function runInit() {
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
          { title: "testnet \u2014 recommended for trying things out", value: "testnet" },
          { title: "mainnet \u2014 real Walrus storage, real SUI", value: "mainnet" }
        ]
      },
      {
        type: "password",
        name: "suiPrivateKey",
        message: "Sui private key (suiprivkey1\u2026) \u2014 optional, only needed for on-chain publishing",
        initial: existing?.suiPrivateKey ?? ""
      }
    ],
    { onCancel: () => fail("Cancelled.") }
  );
  if (answers.suiPrivateKey) {
    try {
      const kp = loadKeypair(answers.suiPrivateKey);
      info(`Detected Sui address: ${kp.toSuiAddress()}`);
    } catch (err) {
      fail(`Invalid Sui private key: ${err.message}`);
    }
  }
  await writeConfig({
    network: answers.network,
    suiPrivateKey: answers.suiPrivateKey || void 0
  });
  console.log("");
  ok("Config saved.");
  kv("Path", CONFIG_PATH);
  kv("Network", answers.network);
  console.log("");
  console.log(
    `  Next: ${violet("scrolls create <spec.yaml>")} ${dim("to publish your first form.")}`
  );
}

// src/commands/create.ts
import { readFile as readFile2, writeFile as writeFile2, mkdir as mkdir2 } from "fs/promises";
import { resolve, dirname, basename, extname } from "path";
import { existsSync as existsSync2 } from "fs";

// src/client-factory.ts
import { ScrollsClient } from "@scrolls/sdk";
async function buildClient(flags = {}) {
  const fileCfg = await readConfig();
  const config = resolveConfig(fileCfg, {
    network: flags.network,
    suiPrivateKey: flags.privateKey,
    walrusPublisher: flags.publisher,
    walrusAggregator: flags.aggregator,
    suiRpc: flags.rpc,
    scrollsPackage: flags.pkg,
    walrusEpochs: flags.epochs,
    appUrl: flags.appUrl
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
    appUrl: config.appUrl
  });
  return { client, config };
}

// src/commands/create.ts
async function runCreate(specPath, opts) {
  if (!opts.json) banner();
  const absPath = resolve(process.cwd(), specPath);
  if (!existsSync2(absPath)) {
    fail(`Spec file not found: ${absPath}`);
  }
  const source = await readFile2(absPath, "utf8");
  const { client, config } = await buildClient(opts);
  if (!opts.json) {
    info(`Reading spec ${dim(absPath)}`);
    info(`Uploading to Walrus (${config.network})\u2026`);
  }
  let result;
  try {
    result = await client.createForm(source);
  } catch (err) {
    fail(err.message);
  }
  let keyFilePath;
  if (result.decryptionKey) {
    const keyOut = opts.keyOut ?? resolve(dirname(absPath), `${basename(absPath, extname(absPath))}.key.json`);
    await writeKeyFile(keyOut, result.formId, result.decryptionKey);
    keyFilePath = keyOut;
  }
  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ...result,
          keyFile: keyFilePath
        },
        null,
        2
      ) + "\n"
    );
    return;
  }
  console.log("");
  ok("Form published.");
  kv("Form ID", result.formId);
  kv("Blob", result.blobId);
  if (result.pointerId) kv("Pointer", result.pointerId);
  if (result.txDigest) kv("Tx", result.txDigest);
  if (keyFilePath) {
    kv("Private key", keyFilePath);
    console.log("");
    warn("Guard this key file. Without it you cannot decrypt responses.");
  }
  console.log("");
  console.log(`  ${bold("Share:")} ${cyan(result.shareUrl)}`);
  console.log(
    `  ${dim("Responses:")} ${dim(violet(`scrolls submissions ${result.formId}`))}`
  );
}
async function writeKeyFile(path, formId, key) {
  const dir = dirname(path);
  if (!existsSync2(dir)) await mkdir2(dir, { recursive: true });
  const body = JSON.stringify(
    {
      formId,
      algorithm: "ECDH-P256",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      publicKeyJwk: key.publicKeyJwk,
      privateKeyJwk: key.privateKeyJwk
    },
    null,
    2
  );
  await writeFile2(path, body, { encoding: "utf8", mode: 384 });
}

// src/commands/list.ts
async function runList(opts) {
  if (!opts.json) banner();
  const { client, config } = await buildClient(opts);
  let forms;
  try {
    forms = await client.listForms(opts.address);
  } catch (err) {
    fail(err.message);
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify(forms, null, 2) + "\n");
    return;
  }
  if (!forms.length) {
    info(`No forms published on ${config.network}.`);
    return;
  }
  ok(`${forms.length} form${forms.length === 1 ? "" : "s"} on ${config.network}`);
  console.log("");
  for (const f of forms) {
    console.log(`  ${bold(truncate(f.pointerId))}`);
    kv("Blob", truncate(f.blobId));
    kv("Version", String(f.version));
    kv("Updated", new Date(f.updatedAtMs).toISOString());
    kv("Share", cyan(client.shareUrl(f.pointerId)));
    console.log(`  ${dim("\u2500".repeat(40))}`);
  }
}

// src/commands/get.ts
async function runGet(formId, opts) {
  if (!opts.json) banner();
  const { client } = await buildClient(opts);
  let form;
  try {
    form = await client.getForm(formId);
  } catch (err) {
    fail(err.message);
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify(form, null, 2) + "\n");
    return;
  }
  ok(`Form ${bold(form.title)}`);
  if (form.description) console.log(`  ${dim(form.description)}`);
  kv("ID", formId);
  kv("Fields", String(form.fields.length));
  kv("Private", form.settings.isPrivate ? "yes" : "no");
  kv("Owner", form.ownerAddress);
  kv("Share", cyan(client.shareUrl(formId)));
  console.log("");
  console.log(`  ${bold("Fields")}`);
  for (const f of form.fields) {
    console.log(`    ${dim("\xB7")} ${f.label} ${dim(`(${f.type}${f.required ? ", required" : ""})`)}`);
  }
}

// src/commands/submissions.ts
import { readFile as readFile3 } from "fs/promises";
async function runSubmissions(formId, opts) {
  if (!opts.json) banner();
  const { client } = await buildClient(opts);
  const privateKeyJwk = await loadKeyFile(opts.key);
  let subs;
  try {
    subs = await client.listSubmissions(formId, {
      privateKeyJwk,
      limit: opts.limit
    });
  } catch (err) {
    fail(err.message);
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify(subs, null, 2) + "\n");
    return;
  }
  if (!subs.length) {
    info("No submissions yet.");
    return;
  }
  ok(`${subs.length} submission${subs.length === 1 ? "" : "s"}`);
  if (subs.some((s) => s.wasEncrypted) && !privateKeyJwk) {
    console.log("");
    warn("Some submissions are encrypted. Pass --key <path.json> to decrypt.");
  }
  console.log("");
  for (const s of subs) {
    console.log(`  ${bold(s.submittedAt)} ${dim(s.wasEncrypted ? "(encrypted)" : "")}`);
    if (s.submitterAddress) kv("From", truncate(s.submitterAddress));
    if (s.responses.length === 0 && s.wasEncrypted) {
      kv("Body", dim("[encrypted \u2014 supply --key to decrypt]"));
    } else {
      for (const r of s.responses) {
        kv(r.fieldId, stringify(r.value));
      }
    }
    console.log(`  ${dim("\u2500".repeat(40))}`);
  }
}
async function loadKeyFile(path) {
  if (!path) return void 0;
  try {
    const raw = await readFile3(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.privateKeyJwk) return parsed.privateKeyJwk;
    if (parsed.kty) return parsed;
    fail(`Key file ${path} has no privateKeyJwk.`);
  } catch (err) {
    fail(`Failed to read key file ${path}: ${err.message}`);
  }
}
function stringify(v) {
  if (v === null || v === void 0) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// src/commands/export.ts
import { writeFile as writeFile3, readFile as readFile4 } from "fs/promises";
async function runExport(formId, opts) {
  const { client } = await buildClient(opts);
  let privateKeyJwk;
  if (opts.key) {
    try {
      const raw = await readFile4(opts.key, "utf8");
      const parsed = JSON.parse(raw);
      privateKeyJwk = parsed.privateKeyJwk ?? parsed;
    } catch (err) {
      fail(`Failed to read key file ${opts.key}: ${err.message}`);
    }
  }
  let csv;
  try {
    csv = await client.exportCsv(formId, { privateKeyJwk });
  } catch (err) {
    fail(err.message);
  }
  if (opts.out) {
    await writeFile3(opts.out, csv, "utf8");
    banner();
    ok("CSV written.");
    kv("Path", opts.out);
    kv("Rows", String(csv.split("\n").length - 1));
    console.log(`  ${dim("(header included)")}`);
    return;
  }
  process.stdout.write(csv);
  if (!csv.endsWith("\n")) process.stdout.write("\n");
}

// src/commands/submit.ts
import { readFile as readFile5 } from "fs/promises";
import { resolve as resolve2 } from "path";
async function runSubmit(formId, responsesPath, opts) {
  const abs = resolve2(process.cwd(), responsesPath);
  let parsed;
  try {
    parsed = JSON.parse(await readFile5(abs, "utf8"));
  } catch (err) {
    fail(`Failed to read ${abs}: ${err.message}`);
  }
  const responses = normalise(parsed);
  const { client } = await buildClient(opts);
  let result;
  try {
    result = await client.submit(formId, responses);
  } catch (err) {
    fail(err.message);
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  banner();
  ok("Submitted.");
  kv("Submission", result.submissionId);
  kv("Blob", result.blobId);
  if (result.txDigest) kv("Tx", result.txDigest);
}
function normalise(input) {
  if (Array.isArray(input)) {
    return input.map((r) => {
      if (!r || typeof r !== "object" || !("fieldId" in r)) {
        fail("Each response must be an object with fieldId and value.");
      }
      const obj = r;
      if (typeof obj.fieldId !== "string") fail("fieldId must be a string.");
      return { fieldId: obj.fieldId, value: obj.value };
    });
  }
  if (input && typeof input === "object") {
    return Object.entries(input).map(([fieldId, value]) => ({
      fieldId,
      value
    }));
  }
  fail("Responses file must be an array or an object.");
}

// src/index.ts
var program = new Command();
program.name("scrolls").description("Walrus-native forms from your terminal.").version("0.1.0");
function addCommonOptions(cmd) {
  return cmd.addOption(
    new Option("--network <name>", "testnet | mainnet | devnet").choices([
      "testnet",
      "mainnet",
      "devnet"
    ])
  ).option("--private-key <key>", "Sui ed25519 private key (suiprivkey1\u2026)").option("--publisher <url>", "Walrus publisher URL").option("--aggregator <url>", "Walrus aggregator URL").option("--rpc <url>", "Sui RPC URL").option("--pkg <id>", "Scrolls Move package id").option("--epochs <n>", "Walrus storage epochs", (v) => Number(v)).option("--app-url <url>", "Scrolls web app base URL");
}
program.command("init").description("Set up ~/.scrolls/config.json").action(() => runInit().catch(panic));
addCommonOptions(
  program.command("create <spec>").description("Publish a form from a YAML or JSON spec file")
).option("--key-out <path>", "Where to write the decryption key for private forms").option("--json", "Emit machine-readable JSON only").action(
  (spec, opts) => runCreate(spec, opts).catch(panic)
);
addCommonOptions(program.command("list").description("List forms for the configured signer")).option("--address <0x\u2026>", "List forms for a specific Sui address").option("--json", "Emit JSON only").action(
  (opts) => runList(opts).catch(panic)
);
addCommonOptions(program.command("get <formId>").description("Fetch a form config")).option("--json", "Emit JSON only").action(
  (formId, opts) => runGet(formId, opts).catch(panic)
);
addCommonOptions(
  program.command("submissions <formId>").description("List submissions (use --key to decrypt private forms)")
).option("--key <path>", "Path to the decryption key JSON").option("--limit <n>", "Max submissions to fetch", (v) => Number(v)).option("--json", "Emit JSON only").action(
  (formId, opts) => runSubmissions(formId, opts).catch(panic)
);
addCommonOptions(program.command("export <formId>").description("Export submissions as CSV")).option("--key <path>", "Path to the decryption key JSON").option("--out <path>", "Write CSV to a file instead of stdout").action(
  (formId, opts) => runExport(formId, opts).catch(panic)
);
addCommonOptions(
  program.command("submit <formId> <responsesFile>").description("Submit responses from a JSON file")
).option("--json", "Emit JSON only").action(
  (formId, file, opts) => runSubmit(formId, file, opts).catch(panic)
);
program.parseAsync(process.argv);
function panic(err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`
  \u2717 ${msg}
`);
  process.exit(1);
}
