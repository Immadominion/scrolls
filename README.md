# Scrolls

> Walrus-native form & feedback platform. Build a form, share a link, every response is stored permanently on Walrus.

[![Walrus](https://img.shields.io/badge/storage-Walrus_mainnet-4f8ff7?style=flat-square)](https://www.walrus.xyz/)
[![Sui](https://img.shields.io/badge/registry-Sui_testnet-6fbcf0?style=flat-square)](https://sui.io/)
[![Seal](https://img.shields.io/badge/private_responses-Seal-22c55e?style=flat-square)](https://seal-docs.wal.app/)
[![Static export](https://img.shields.io/badge/Next.js_16-static-black?style=flat-square)](https://nextjs.org/)

Submission for **Walrus Sessions Round 2 — Form Tooling** ($1,500).

- 🌐 **Live (Walrus Site):** [`3z1329sy….wal.app`](https://3z1329syoieg9laz3kilwa9y98d2i1raqqodp74rmyc9n4fnmu.testnet.wal.app)
- 🌐 **Live (Production):** [`scrolls.fun`](https://scrolls.fun) · [`scrolls-tau.vercel.app`](https://scrolls-tau.vercel.app)
- 🎥 **Demo (on Walrus):** *fill in after recording*
- 🐳 **Move package (Sui testnet):** [`0x6418bc0c…7b10a0`](https://suiscan.xyz/testnet/object/0x6418bc0c11e75ef443f7e8fedb9a860b6cc3bfe5909481dc309472ad8b7b10a0)

---

## What it does

| | |
|---|---|
| **Build** | Drag-and-drop form builder. Short text, rich text, dropdown, checkbox, star rating, file & video upload, URL, confirmation. AI-assisted draft from a prompt + optional image / PDF / audio. |
| **Share** | Clean public URL `/f?id=<form-id>`. Custom-slug short links (`<host>/s/<slug>`) signed by your wallet. QR code in one click. |
| **Collect** | Submissions are JSON blobs on Walrus mainnet. File/video answers are uploaded as separate Walrus blobs. Responses can be public or end-to-end encrypted. |
| **Encrypt** | Private responses use a per-form ECIES envelope today (ECDH P-256 + HKDF-SHA256 + AES-GCM-256, browser-side). Seal multi-admin policies are wired on testnet for the next milestone. |
| **Review** | Per-form admin dashboard: sortable list, inline notes, priority tags, AI-assisted sentiment & topic clustering (Claude Haiku), CSV / JSON export. |

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│            Browser (Next.js 16 static export)              │
│   builder · public form · dashboard · responses viewer     │
└────────────┬──────────────────┬──────────────┬─────────────┘
             │                  │              │
       blob R/W           tx + reads      AI / shorten
             │                  │              │
   ┌─────────▼────────┐  ┌──────▼─────┐ ┌──────▼──────────┐
   │  Walrus mainnet  │  │ Sui (test) │ │ Cloudflare      │
   │  (form + answer  │  │ FormPointer│ │ Worker          │
   │   blobs, files)  │  │ Submission │ │  ai-proxy/      │
   │                  │  │ Ref + Seal │ │  Claude · Whisper│
   │                  │  │ Policy     │ │  /s short links │
   └──────────────────┘  └────────────┘ └─────────────────┘
```

**No backend, ever.** The frontend is a static export — every byte is shipped to the browser, every data op goes directly to Walrus, Sui, or the Cloudflare Worker (which only proxies AI keys).

| Component | Network | Where |
|---|---|---|
| Form / answer blobs | Walrus mainnet | [`aggregator.walrus.space`](https://aggregator.walrus.space) |
| `FormPointer`, `SubmissionRef`, `FormPolicy` | Sui testnet | `0x6418bc0c…7b10a0` |
| Seal verifier | Sui testnet | `0x40168694…b2c3` |
| AI proxy + short links | Cloudflare Worker | [`ai-proxy/`](./ai-proxy/) |

---

## Repo layout

```
app/         Next.js 16 (App Router, static export). The product.
ai-proxy/    Cloudflare Worker — Anthropic + Whisper proxy + /s shortener
move/scrolls Move package: form_pointer, submission_ref, seal_policy
docs/        SPEC, ENGINEERING-PLAN, TESTING
```

For deeper dives:

- [`docs/SPEC.md`](docs/SPEC.md) — product spec
- [`docs/TESTING.md`](docs/TESTING.md) — manual test plan
- [`DEPLOY.md`](DEPLOY.md) — deploy your own copy

---

## Run locally

```bash
# Terminal 1 — AI proxy (needed for AI features + short links)
cd ai-proxy
pnpm install
cp .dev.vars.example .dev.vars   # add ANTHROPIC_API_KEY (and OPENAI_API_KEY for voice)
pnpm dev                          # http://localhost:8787

# Terminal 2 — app
cd app
pnpm install
cp .env.example .env.local
pnpm dev                          # http://localhost:3000
```

You'll need a Sui extension wallet with a few testnet SUI to publish a form (free from the [faucet](https://faucet.sui.io/)). Walrus blobs in dev go to testnet; flip to mainnet by copying `.env.production.example`.

---

## Deploy

See **[DEPLOY.md](./DEPLOY.md)** — a single 10-minute walkthrough that covers:

1. Cloudflare Worker (`ai-proxy/`) — KV + secrets + `wrangler deploy`
2. Frontend on Vercel (1-click) and/or Walrus Sites (`site-builder deploy`)
3. Optional SuiNS name for a `wal.app` URL

---

## Tech

Next.js 16 · TypeScript · Tailwind · Framer Motion · `@mysten/dapp-kit-react` 2.x · `@mysten/walrus` 1.x · `@mysten/sui` 2.x · Tiptap · dnd-kit · Recharts · qrcode.react · Cloudflare Workers · Anthropic Claude Haiku 4.5 · OpenAI Whisper.

---

## License

MIT — see [LICENSE](./LICENSE).
