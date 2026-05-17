# Programmatic Scrolls

Scrolls is a form platform that stores everything on [Walrus](https://walrus.site): no server, no database, no vendor lock-in. The web app at [scrolls.fun](https://scrolls.fun) is the friendly face. This document is for the **other** way to use it: from your terminal, your scripts, and your AI agents.

Three packages, one foundation:

| Package | Install | What it does |
| --- | --- | --- |
| [`@scrolls/sdk`](#sdk) | `npm i @scrolls/sdk` | Typed Node library. Create, fetch, encrypt, decrypt, list. |
| [`@scrolls/cli`](#cli) | `npm i -g @scrolls/cli` | The `scrolls` command. Publish forms from YAML. |
| [`@scrolls/mcp`](#mcp) | `npm i -g @scrolls/mcp` | MCP server. Lets Claude (or any agent) drive Scrolls. |

Every form you publish through these tools shows up in the web dashboard at `https://scrolls.fun/dashboard`: same data, same URL, same decryption keys.

## Contents

- [At a glance](#at-a-glance)
- [Why programmatic](#why-programmatic)
- [SDK](#sdk)
- [CLI](#cli)
- [MCP](#mcp)
- [Recipes](#recipes)
- [Network defaults](#network-defaults)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Source](#source)
- [License](#license)

---

## At a glance

```bash
# 1. Drop a YAML file
cat > bug-report.yaml <<'EOF'
title: Bug report
fields:
    - { type: short_text, label: Title, required: true }
    - { type: long_text,  label: What happened?, required: true }
    - { type: dropdown,   label: Severity, options: [low, medium, high] }
EOF

# 2. Publish it
scrolls create bug-report.yaml

# ✦ scrolls · walrus-native forms
# · Reading spec /path/bug-report.yaml
# · Uploading to Walrus (testnet)…
# ✓ Form published.
#   Form ID        0x4a…b29c
#   Blob           _0QTBv…Mtrw
#   Tx             5GfH8…1bX
#
#   Share: https://scrolls.fun/f?id=0x4a…b29c
```

That's it. The form is live on Walrus, indexed on Sui, and reachable from any browser.

---

## Why programmatic?

The web builder is great for ad-hoc forms. The programmatic surface is for everything else:

- **Bug-report widgets in your own app:** embed `<a href=`https://scrolls.fun/f?id={formId}`>Report a bug</a>` and never run a backend.
- **CI feedback:** fail a build, file a form, link it in the PR comment.
- **Agentic flows:** let an LLM design a survey, publish it, share the link, then read responses back when they arrive.
- **Migrations:** bulk-create forms from existing systems with the SDK in a loop.
- **Reproducible forms:** your form lives in a YAML file in git. Re-publish on demand.

---

<a id="sdk"></a>
## SDK - `@scrolls/sdk`

The foundation. Pure Node 20+, ESM-only, zero runtime config. The CLI and MCP server are thin wrappers around it.

### Install

```bash
npm install @scrolls/sdk
# or
pnpm add @scrolls/sdk
```

### Quickstart

```ts
import { ScrollsClient } from "@scrolls/sdk";

const scrolls = new ScrollsClient({
    network: "testnet",
    // Optional: only needed if you want forms indexed on-chain.
    suiPrivateKey: process.env.SUI_PRIVATE_KEY,
});

const { formId, shareUrl, decryptionKey } = await scrolls.createForm({
    title: "Bug report",
    description: "Help us squash it.",
    settings: { isPrivate: false },
    fields: [
        { type: "short_text", label: "Title", required: true },
        { type: "long_text",  label: "What happened?", required: true },
        { type: "dropdown",   label: "Severity", options: ["low", "medium", "high"] },
    ],
});

console.log(`Share with respondents: ${shareUrl}`);
```

### Client options

```ts
new ScrollsClient({
    network: "testnet" | "mainnet" | "devnet",   // required
    suiPrivateKey?: "suiprivkey1…",              // ed25519 bech32
    walrusPublisher?: "https://…",               // override defaults
    walrusAggregator?: "https://…",
    walrusEpochs?: 53,                           // storage duration
    suiRpc?: "https://…",
    scrollsPackage?: "0x…",                      // Move package id
    appUrl?: "https://scrolls.fun",              // for share URLs
});
```

Without `suiPrivateKey` the client runs in **blob-only mode**: forms still upload to Walrus and the share URL works, but no on-chain `FormPointer` is created and you cannot enumerate submissions cross-device (the submitter has to share the blob id back to you).

### API

#### `createForm(input, opts?) → CreateFormResult`

`input` can be:

1. A `FormSpec` object (recommended).
2. A YAML or JSON string (the CLI uses this internally).
3. A fully-formed `FormConfig` (use this when migrating existing data).

```ts
type CreateFormResult = {
    formId: string;        // pointer id if on-chain, blob id otherwise
    blobId: string;        // always the Walrus blob id
    pointerId?: string;    // Sui object id (only when on-chain)
    txDigest?: string;     // Sui tx digest (only when on-chain)
    shareUrl: string;      // https://scrolls.fun/f?id=…
    decryptionKey?: {      // present iff isPrivate=true
        publicKeyJwk: JsonWebKey;
        privateKeyJwk: JsonWebKey;
    };
};
```

**Private forms.** When `settings.isPrivate` is `true` and you don't supply your own `encryptionPublicKey`, the SDK generates a fresh ECDH P-256 keypair and returns it in `decryptionKey`. **Persist it.** The SDK never stores it anywhere and without it you cannot read responses.

#### `getForm(formId) → FormConfig`

Resolves a pointer id to its current Walrus blob, then fetches and parses the JSON. Accepts either a Sui pointer id (`0x…`) or a raw Walrus blob id.

#### `listForms(address?) → FormPointerSummary[]`

Enumerates every form owned by `address` on the configured Sui network. Requires that `scrollsPackage` is set (it is, by default, on testnet). Throws if no signer is configured and no address is passed.

#### `submit(formId, responses, opts?) → SubmitResult`

```ts
await scrolls.submit(formId, [
    { fieldId: "title",    value: "Login button is dead" },
    { fieldId: "severity", value: "high" },
]);
```

If the form is private, the SDK fetches `form.encryptionPublicKey` and wraps the submission in an ECIES envelope before uploading. If `scrollsPackage` is configured and `formId` is a pointer id, a `SubmissionRecorded` event is emitted on Sui so the owner can index the response cross-device.

#### `listSubmissions(formId, opts?) → DecryptedSubmission[]`

Reads on-chain `SubmissionRecorded` events for the form, then fetches each blob from Walrus.

```ts
const subs = await scrolls.listSubmissions(formId, {
    privateKeyJwk: JSON.parse(fs.readFileSync("bug-report.key.json", "utf8")).privateKeyJwk,
    limit: 100,
});
```

Without `privateKeyJwk`, encrypted submissions come back as stubs (timestamp + submitter address + `wasEncrypted: true`) so you can see they exist without decrypting them.

#### `exportCsv(formId, opts?) → string`

```ts
const csv = await scrolls.exportCsv(formId, { privateKeyJwk: key });
fs.writeFileSync("responses.csv", csv);
```

Columns: `submitted_at, submitter, <field-label-1>, <field-label-2>, …`.

### Spec format

The human-friendly shape used by `createForm` and the CLI:

```ts
type FormSpec = {
    title: string;
    description?: string;
    settings?: {
        isPrivate?: boolean;       // E2E encrypt submissions
        allowAnonymous?: boolean;  // allow responses without wallet
    };
    fields: Array<{
        type:
            | "short_text" | "long_text" | "rich_text"
            | "dropdown" | "multi_select"
            | "star_rating"
            | "file_upload" | "video_upload"
            | "url" | "confirm_checkbox";
        label: string;
        required?: boolean;
        placeholder?: string;
        options?: Array<string | { id: string; label: string }>;
        maxStars?: number;
        maxFileSizeMB?: number;
        acceptedTypes?: string[];
    }>;
};
```

The parser is permissive: missing `id`s, `createdAt`s, and default settings are filled in for you. Invalid specs throw a descriptive `Error` on the first violation rather than collecting them all.

### Errors

Every method throws plain `Error`s with actionable messages. There is no opaque error code system on purpose. The message tells you what to fix.

Common ones:

- `Form spec: \`title\` is required and must be a non-empty string.`
- `dropdown field requires an \`options\` array.`
- `listSubmissions: form id must be a Sui pointer id (0x…) to enumerate submissions.`
- `Walrus publisher rejected blob (HTTP 451)`: typically means the publisher is paywalled; pass `walrusPublisher` with a working URL or use a different network.

---

<a id="cli"></a>
## CLI - `@scrolls/cli`

The `scrolls` command. Wraps the SDK with a config file at `~/.scrolls/config.json`.

### Install

```bash
npm install -g @scrolls/cli
# or run without installing
npx @scrolls/cli --help
```

### First run

```bash
scrolls init
```

Interactive wizard. Asks for a network (testnet / mainnet) and an optional Sui private key. The config file is written with `chmod 600` so other users on the machine can't read your key.

You can skip `init` and pass `--network` and `--private-key` to every command instead. This is useful in CI where the secret comes from an env var.

### Commands

| Command | What it does |
| --- | --- |
| `scrolls init` | Interactive config wizard |
| `scrolls create <spec.yaml>` | Publish a new form from a YAML or JSON file |
| `scrolls list` | List forms owned by the configured signer |
| `scrolls get <formId>` | Fetch and print a form's config |
| `scrolls submissions <formId>` | List submissions (with `--key` to decrypt) |
| `scrolls export <formId>` | Dump submissions as CSV |
| `scrolls submit <formId> <responses.json>` | Submit a response from the CLI |

Every command (except `init`) accepts these flags:

```
--network <testnet|mainnet|devnet>
--private-key <suiprivkey1…>
--publisher <url>     Walrus publisher
--aggregator <url>    Walrus aggregator
--rpc <url>           Sui RPC URL
--pkg <0x…>           Scrolls Move package id
--epochs <n>          Walrus storage epochs (default 53)
--app-url <url>       Scrolls web app base URL
--json                Machine-readable output (where applicable)
```

CLI flags always win over the config file.

### Spec files

`scrolls create` accepts YAML or JSON. Format is auto-detected from the first non-whitespace character.

```yaml
# bug-report.yaml
title: Bug report
description: Help us squash it.

settings:
    isPrivate: false
    allowAnonymous: true

fields:
    - type: short_text
      label: Title
      required: true
      placeholder: One-line summary

    - type: long_text
      label: What happened?
      required: true

    - type: dropdown
      label: Severity
      required: true
      options: [low, medium, high, critical]
```

### Private forms

When you publish a private form, the CLI writes the freshly-generated decryption key next to your spec file as `<spec>.key.json` with `chmod 600`. Override with `--key-out path/to/key.json`. **Back this file up.** Without it, you cannot decrypt responses. Ever.

```bash
scrolls create salary-survey.yaml
#   Private key   ./salary-survey.key.json
# !  Guard this key file. Without it you cannot decrypt responses.
```

Reading back:

```bash
scrolls submissions 0x4a…b29c --key salary-survey.key.json
scrolls export      0x4a…b29c --key salary-survey.key.json --out responses.csv
```

### JSON mode

Every read/write command supports `--json` for piping into other tools:

```bash
FORM_ID=$(scrolls create bug-report.yaml --json | jq -r .formId)
scrolls submissions "$FORM_ID" --json | jq '.[] | select(.wasEncrypted == false)'
```

### CI recipe

```yaml
# .github/workflows/feedback.yml
- name: Publish feedback form
  env:
      SUI_PRIVATE_KEY: ${{ secrets.SUI_PRIVATE_KEY }}
  run: |
      npx -y @scrolls/cli create feedback.yaml \
          --network mainnet \
          --private-key "$SUI_PRIVATE_KEY" \
          --json > form.json
      echo "FORM_URL=$(jq -r .shareUrl form.json)" >> $GITHUB_ENV
```

---

<a id="mcp"></a>
## MCP - `@scrolls/mcp`

Model Context Protocol server. Lets any MCP-aware agent, including Claude Desktop, Cursor, Continue, or your own, create and read Scrolls forms on your behalf.

### Install

```bash
npm install -g @scrolls/mcp
```

The package installs a `scrolls-mcp` binary that speaks JSON-RPC over stdio.

### Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
    "mcpServers": {
        "scrolls": {
            "command": "scrolls-mcp",
            "env": {
                "SCROLLS_NETWORK": "testnet",
                "SUI_PRIVATE_KEY": "suiprivkey1…"
            }
        }
    }
}
```

Restart Claude. You should see a plug icon. Click it and confirm `scrolls` is listed.

### Configure Cursor

Add to `~/.cursor/mcp.json`:

```json
{
    "mcpServers": {
        "scrolls": {
            "command": "scrolls-mcp",
            "env": {
                "SCROLLS_NETWORK": "testnet",
                "SUI_PRIVATE_KEY": "suiprivkey1…"
            }
        }
    }
}
```

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SCROLLS_NETWORK` | `testnet` | `testnet` / `mainnet` / `devnet` |
| `SUI_PRIVATE_KEY` | _(none)_ | Sui ed25519 bech32. Required for on-chain ops. |
| `SCROLLS_PACKAGE` | per-network default | Move package id override |
| `SCROLLS_PUBLISHER` | per-network default | Walrus publisher URL |
| `SCROLLS_AGGREGATOR` | per-network default | Walrus aggregator URL |
| `SCROLLS_SUI_RPC` | per-network default | Sui RPC URL |
| `SCROLLS_APP_URL` | `https://scrolls.fun` | Share-URL base |

### Tools exposed

| Tool | Purpose |
| --- | --- |
| `scrolls_create_form` | Publish a new form. Returns `formId`, `shareUrl`, and `decryptionKey` for private forms. |
| `scrolls_list_forms` | List forms owned by an address. |
| `scrolls_get_form` | Fetch a form's config and share URL. |
| `scrolls_list_submissions` | List submissions for a form (with optional `privateKeyJwk` to decrypt). |
| `scrolls_export_submissions` | Return all submissions as a CSV string. |
| `scrolls_submit_response` | Submit a response. |

### Example prompt

> Create a Scrolls form titled "Hackathon judging" with fields for project name, score out of 10, and freeform feedback. Share the link with me.

Claude will call `scrolls_create_form`, the server publishes the form to Walrus, and you get the share URL back in the chat. Same data shows up in the web dashboard immediately.

### Security note

The MCP server holds your Sui private key in its environment. It runs locally. Nothing is sent off-machine except the signed Sui transactions and Walrus blob uploads. If you don't trust an agent with publish power, run the server with no `SUI_PRIVATE_KEY` and it will still let agents read forms and submit responses in blob-only mode.

---

## Recipes

Real workflows. Copy, adapt, ship.

### 1. Embed a bug-report button in any app

Publish the form once with the CLI, then drop the share URL behind a button. No backend, no SDK in your frontend.

```bash
scrolls create bug-report.yaml --json | jq -r .shareUrl > FORM_URL.txt
```

```html
<a
    href="https://scrolls.fun/f?id=0x4a…b29c"
    target="_blank"
    rel="noreferrer"
>
    Report a bug ↗
</a>
```

The form lives forever on Walrus. The dashboard at `scrolls.fun/dashboard` reads your submissions whenever you visit, no polling required.

### 2. Daily encrypted export to S3

```bash
#!/usr/bin/env bash
# crontab: 0 6 * * *  /opt/scrolls/daily-export.sh
set -euo pipefail

FORM_ID="0x4a…b29c"
KEY="/etc/scrolls/feedback.key.json"
OUT="/tmp/feedback-$(date +%F).csv"

scrolls export "$FORM_ID" --key "$KEY" --out "$OUT"
aws s3 cp "$OUT" "s3://acme-feedback/$(basename "$OUT")"
rm "$OUT"
```

The decryption key sits at `chmod 600` on the box. Walrus and Sui see only ciphertext + submitter address.

### 3. Migrate forms from another tool

```ts
import { ScrollsClient } from "@scrolls/sdk";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const scrolls = new ScrollsClient({
    network: "mainnet",
    suiPrivateKey: process.env.SUI_PRIVATE_KEY,
});

const manifest: Array<{ source: string; formId: string; shareUrl: string }> = [];

for (const file of readdirSync("./legacy-forms").filter((f) => f.endsWith(".json"))) {
    const legacy = JSON.parse(readFileSync(`./legacy-forms/${file}`, "utf8"));

    const { formId, shareUrl } = await scrolls.createForm({
        title: legacy.name,
        description: legacy.description,
        fields: legacy.questions.map(mapLegacyField),
    });

    manifest.push({ source: file, formId, shareUrl });
    console.error(`✓  ${file} → ${formId}`);
}

writeFileSync("./migration-manifest.json", JSON.stringify(manifest, null, 2));
```

### 4. Agent-driven survey loop

With the MCP server installed in Claude Desktop, this single prompt builds a survey, publishes it, and reports back when responses arrive:

> Design a 5-question NPS survey for our beta users. Publish it as a private Scrolls form, give me the share link and save the decryption key locally. Tomorrow morning, decrypt the responses and summarise the themes.

Claude calls `scrolls_create_form`, persists the returned `decryptionKey` to disk, and the next morning calls `scrolls_export_submissions` with the key to read the responses.

### 5. Programmatic submit (form filling)

Useful for synthetic monitoring or seeding test data.

```ts
await scrolls.submit("0x4a…b29c", [
    { fieldId: "title",    value: "Login button is dead" },
    { fieldId: "details",  value: "Click does nothing on Safari 17." },
    { fieldId: "severity", value: "high" },
]);
```

You can also pass an object keyed by field id. The SDK normalises both shapes.

---

## Network defaults

| Network | Walrus publisher | Walrus aggregator | Scrolls package |
| --- | --- | --- | --- |
| `testnet` | `https://publisher.walrus-testnet.walrus.space` | `https://aggregator.walrus-testnet.walrus.space` | `0x6418bc0c11e75ef443f7e8fedb9a860b6cc3bfe5909481dc309472ad8b7b10a0` |
| `mainnet` | `https://publisher.walrus.space` | `https://aggregator.walrus.space` | _(not deployed yet; blob-only)_ |
| `devnet` | _(blob-only)_ | _(blob-only)_ | _(blob-only)_ |

Override any of these with `--publisher`, `--aggregator`, `--pkg`, or the matching env var.

---

## Security model

- **Private forms** are end-to-end encrypted in your process. The SDK uses an ECIES envelope: ephemeral ECDH P-256 → HKDF-SHA256 → AES-GCM-256, identical to the one in the web app (`app/src/lib/crypto.ts`). Submissions can only be decrypted by the holder of the matching ECDH private key.
- **Walrus storage is public.** Anyone with the blob id can fetch the bytes. Privacy comes from encryption, not from secrecy of the id.
- **On-chain pointers are public.** Every `FormPointer` and `SubmissionRecorded` event is readable by anyone watching the Sui chain. Encrypted submissions reveal the submitter address and timestamp but nothing else.
- **The Sui private key never leaves your machine.** The CLI stores it in `~/.scrolls/config.json` with mode 600. The MCP server reads it from its environment. Neither package ever transmits it.

---

## Troubleshooting

**`Walrus publisher rejected blob (HTTP 451)`**  
The default testnet publisher is rate-limited or paywalled. Try a different one with `--publisher` or via `SCROLLS_PUBLISHER`.

**`Form id "0x…" looks like a Sui object but no Move package is configured`**  
You're on `mainnet` or `devnet` where the Scrolls Move package isn't deployed yet. Either switch to testnet or pass `--pkg <id>` if you've deployed your own.

**`listSubmissions: form id must be a Sui pointer id (0x…)`**  
Forms created without a Sui signer don't have an on-chain index. Enumerating their submissions requires the submitter to share the blob id back.

**`Insufficient gas` from Sui**  
Your signer wallet needs SUI to pay for transactions. On testnet, hit the [faucet](https://faucet.testnet.sui.io). On mainnet, fund the address with real SUI.

**MCP server isn't appearing in Claude Desktop**  
Restart Claude completely (`Cmd+Q` on macOS). Check the JSON file syntax with `jq .`: a stray comma will silently disable every server. Logs are at `~/Library/Logs/Claude/`.

**MCP server output is corrupted JSON**  
If you forked the server, make sure no code path writes to stdout. Stdio is reserved for JSON-RPC framing. Use `console.error` for diagnostics.

---

## Source

All three packages live in this repository under [packages/](../packages/):

- [packages/sdk/](../packages/sdk/): `@scrolls/sdk`
- [packages/cli/](../packages/cli/): `@scrolls/cli`
- [packages/mcp/](../packages/mcp/): `@scrolls/mcp`

Build everything locally:

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js --help
```

---

## License

MIT. Use it however you want.
