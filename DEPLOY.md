# Deploying Scrolls

A single 10-minute walkthrough. Three pieces deploy in this order:

1. **Cloudflare Worker** — `ai-proxy/` (AI keys + short-link service)
2. **Move package** — `move/scrolls/` (only if you want on-chain registry on a new network)
3. **Frontend** — `app/` (Vercel or Walrus Sites)

---

## 0. Pick your network profile

| Profile | Walrus | Sui | Seal | When |
|---|---|---|---|---|
| **Dev** | testnet | testnet | testnet | Local development |
| **Hybrid** *(recommended)* | mainnet | testnet | testnet | Ship to users today. Permanent storage on Walrus mainnet, free registry + working private forms via testnet. |
| **Full mainnet** | mainnet | mainnet | ❌ disabled | When you've published the Move package on Sui mainnet **and** are OK with private forms being hidden until you wire a paid Seal provider. |

> **Why no Seal on mainnet?** Mysten Labs hasn't shipped an Open-mode mainnet key server yet ([pricing page](https://seal-docs.wal.app/Pricing/)). All current mainnet providers (Ruby Nodes, NodeInfra, Enoki, Overclock, …) are paid / contact-only. The app gracefully hides the "Private form" toggle when `SEAL_KEY_SERVERS.mainnet` is empty — public forms keep working.

This guide assumes **Hybrid** unless flagged. The flips for full mainnet are at the end.

---

## 1. Deploy the Cloudflare Worker

```bash
cd ai-proxy
pnpm install
pnpm exec wrangler login
```

Create the two KV namespaces (skip if they already show real ids in `wrangler.toml`):

```bash
pnpm exec wrangler kv namespace create RATE_LIMIT
pnpm exec wrangler kv namespace create LINKS
# paste the ids into wrangler.toml under the matching [[kv_namespaces]] block
```

Set secrets (NEVER put these in `wrangler.toml`):

```bash
pnpm exec wrangler secret put ANTHROPIC_API_KEY
pnpm exec wrangler secret put OPENAI_API_KEY       # optional, voice + video transcription
```

Edit `wrangler.toml` → `ALLOWED_ORIGINS`: add your prod origin (e.g. `https://scrolls.fun,https://<your-vercel>.vercel.app,http://localhost:3000`).

Deploy:

```bash
pnpm exec wrangler deploy
# → https://scrolls-ai-proxy.<your-account>.workers.dev
```

**Optional but recommended** — pretty short-link URLs. In the Cloudflare dashboard add a **Worker Route** `<your-domain>/s/*` → this Worker. Now `https://<your-domain>/s/abc12` redirects through the Worker.

---

## 2. (Full-mainnet only) Publish the Move package on Sui mainnet

Skip this step for the **Hybrid** profile — the testnet package at `0x6418bc0c…7b10a0` is already wired.

```bash
cd move/scrolls
sui client switch --env mainnet
sui client publish --gas-budget 200000000
```

You need **~2 SUI** in the active address. Get from an exchange (Binance / OKX / KuCoin list SUI) and `sui client active-address` to confirm where to send.

After success, copy two values from the CLI output:

| From the output | Paste into |
|---|---|
| `Published Object → packageId` (the `0x...`) | `app/src/lib/contracts.ts` → `SCROLLS_PACKAGES.mainnet` |
| `Created Objects → UpgradeCap` id | `move/scrolls/Published.toml` (new `[published.mainnet]` block) and your password manager |

---

## 3. Configure the frontend

```bash
cd app
cp .env.production.example .env.production.local
```

Edit `.env.production.local` and set the three Worker URLs (all the same value):

```bash
NEXT_PUBLIC_AI_PROXY_URL=https://scrolls-ai-proxy.<your-account>.workers.dev
NEXT_PUBLIC_CLAUDE_PROXY_URL=https://scrolls-ai-proxy.<your-account>.workers.dev
NEXT_PUBLIC_SHORT_LINK_BASE=https://scrolls-ai-proxy.<your-account>.workers.dev
# If you wired the Cloudflare Route in step 1, use your apex domain here instead:
# NEXT_PUBLIC_SHORT_LINK_BASE=https://scrolls.fun
```

For **Full mainnet**, also flip:

```bash
NEXT_PUBLIC_SUI_NETWORK=mainnet
```

The Walrus URLs in `.env.production.example` already point at mainnet (`aggregator.walrus.space` / `publisher.walrus.space`).

---

## 4. Deploy the frontend

### Option A — Vercel (fastest, ~2 min)

1. Push the repo to GitHub
2. Import in Vercel → root directory `app/`
3. Build command auto-detected. Output is `app/out/` (static export).
4. Paste every `NEXT_PUBLIC_*` value from `.env.production.local` into Vercel **Project → Settings → Environment Variables**
5. Deploy

### Option B — Walrus Sites (decentralized, gives you a `wal.app` URL)

```bash
cargo install --git https://github.com/MystenLabs/walrus-sites site-builder
cd app
pnpm build                                  # → app/out/
site-builder publish ./out --epochs 10
# → prints your-site-object-id and a portal URL like
#   https://<base36>.wal.app
```

To pin a SuiNS name to it (e.g. `scrolls.wal.app`):

```bash
# 1. Buy/mint a SuiNS name at https://suins.io
# 2. Set its target_address to your-site-object-id
# 3. Wait a few minutes for the portal to pick it up
```

---

## 5. Verify

Smoke test in this order:

1. **Open** the deployed URL → landing renders, Connect button works
2. **Connect a wallet** → dashboard shows empty state
3. **Builder** → AI prompt input, type "bug report form", press generate → form fields appear within ~5 s (Worker is reachable, Anthropic key valid)
4. **Publish** the form → blob upload spinner → success modal with `/f?id=...` link
5. **Open the public link** in an incognito tab → form loads from Walrus
6. **Submit a response** → check `/responses?id=...` from the owner wallet
7. **Short link** → in publish modal click "Get a short link & QR code", pick a slug → QR renders → open the short URL → redirects to your form

If any step fails, see Troubleshooting below.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `403` from Worker, browser console says CORS | Add the exact origin to `ALLOWED_ORIGINS` in `wrangler.toml`, redeploy. |
| `429` from Worker on AI calls | Per-IP rate limit hit (60 / 10 min). Either raise `RATE_LIMIT_PER_WINDOW` in `wrangler.toml` or wait. |
| Form publishes but submission upload fails on production | Walrus mainnet publisher is rate-limited. Switch to a paid publisher endpoint or retry. |
| Private form toggle missing on mainnet | Expected — `SEAL_KEY_SERVERS.mainnet = []`. Stay on Hybrid or wire a paid Seal provider. |
| `Could not find DAppKitContext` in console during prerender | Benign — wallet hooks are wrapped in `useScrollsAccount` which catches it. Ignore. |
| `Skipping wallet initializer: ReferenceError: document is not defined` at build | Benign Enoki SSR warning. Ignore. |
| Short link returns 404 | The `LINKS` KV namespace id in `wrangler.toml` is wrong — re-create with `wrangler kv namespace create LINKS` and paste the new id. |

---

## Upgrading later

- **Worker code change**: `cd ai-proxy && pnpm exec wrangler deploy`
- **Frontend change**: push to GitHub (Vercel auto-deploys) or `pnpm build && site-builder update <site-object-id> ./out`
- **Move package change**: `sui client upgrade --upgrade-capability <UpgradeCap-id> --gas-budget 200000000`, then bump the package id in `app/src/lib/contracts.ts` and `Published.toml`.
- **Rotate API keys**: `pnpm exec wrangler secret put ANTHROPIC_API_KEY`, paste new key, then revoke the old one in the Anthropic console.

---

That's everything. Total cost to ship Hybrid: **$0** (Workers free tier + Vercel hobby + free Sui testnet) plus a few cents of WAL per stored blob.
