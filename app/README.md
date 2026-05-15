# Scrolls — App

Next.js 16 (App Router) static export. The whole product lives here.

## Routes

| Path | What |
|---|---|
| `/` | Landing page |
| `/builder` | Drag-and-drop form builder (with AI assist) |
| `/dashboard` | Lists every form the connected wallet has published |
| `/f?id=<form-id>` | Public form renderer |
| `/responses?id=<form-id>` | Owner-only response viewer + decryption |

Static export forbids dynamic routes (`/[id]`), so everything uses query params.

## Run locally

```bash
pnpm install
cp .env.example .env.local       # defaults: Walrus testnet + Sui testnet + local Worker
pnpm dev                          # → http://localhost:3000
```

You also need the Worker running for AI features and short links:

```bash
cd ../ai-proxy && pnpm dev        # → http://localhost:8787
```

## Build

```bash
pnpm build                         # → app/out/  (static export)
```

For a production build pinned to **Walrus mainnet**, copy `.env.production.example → .env.production.local` first, fill in your Worker URL, then `pnpm build`.

## Notes

- All product code is `"use client"` — no `"use server"`, no API routes (incompatible with `output: 'export'`).
- Wallet hooks must go through `lib/useScrollsAccount.ts` so SSR prerender doesn't crash.
- Walrus reads are slow (~1–3 s) — every fetching component renders a skeleton first.
- Form ID === Walrus blob ID. There is no separate identifier in the local-only path; on-chain mode adds a Sui `FormPointer` object id.

See the root [README](../README.md) and [DEPLOY.md](../DEPLOY.md) for context and deployment.
