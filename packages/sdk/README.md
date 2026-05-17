# @scrolls/sdk

The Node SDK for [Scrolls](https://scrolls.wal.app) — a Walrus-native form platform.

Create, fetch, submit, encrypt, decrypt — all from your own code. No server, no database, no vendor lock-in. Every form lives as a JSON blob on Walrus and (optionally) as a `FormPointer` object on Sui.

## Install

```bash
npm install @scrolls/sdk
```

Requires Node 20+.

## Quickstart

```ts
import { ScrollsClient } from "@scrolls/sdk";

const scrolls = new ScrollsClient({
    network: "testnet",
    suiPrivateKey: process.env.SUI_PRIVATE_KEY, // optional
});

const { formId, shareUrl } = await scrolls.createForm({
    title: "Bug report",
    fields: [
        { type: "short_text", label: "Title", required: true },
        { type: "long_text",  label: "What happened?", required: true },
        { type: "dropdown",   label: "Severity", options: ["low", "medium", "high"] },
    ],
});

console.log(shareUrl);
```

## Full documentation

See [docs/PROGRAMMATIC.md](https://github.com/Immadominion/scrolls/blob/main/docs/PROGRAMMATIC.md) for the complete API reference, recipes, and troubleshooting.

## License

MIT.
