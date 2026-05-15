# Scrolls — AI Proxy

Cloudflare Worker that does three jobs for the static-export frontend:

1. **AI proxy** — forwards `POST /` to Anthropic Claude Haiku 4.5 and `POST /transcribe` to OpenAI Whisper. The browser never sees the API keys.
2. **AI analysis** — `POST /analyze` runs response-summary / sentiment / topic-cluster prompts.
3. **Short links** — `GET /s/:code` (public 302 redirect), `POST /s` (create), `DELETE /s/:code` (owner-only). Create / delete are authenticated with a Sui personal-message signature; mutations from any non-owner address are rejected.

## Why a Cloudflare Worker

The app is a static export deployed on Walrus Sites — there is no Next.js backend. `NEXT_PUBLIC_*` vars are bundled into the JS so we cannot ship the Anthropic key. A Worker gives us a tiny, free edge hop and the two KV namespaces we need (rate-limit counters + short-link records). It is **not portable to Railway / Render** without rewriting `KVNamespace` calls — keep it on Cloudflare.

## Setup (10 min)

```bash
pnpm install

# 1. Auth
pnpm exec wrangler login

# 2. Two KV namespaces — paste each id into wrangler.toml
pnpm exec wrangler kv namespace create RATE_LIMIT
pnpm exec wrangler kv namespace create LINKS

# 3. Secrets (NEVER put these in wrangler.toml)
pnpm exec wrangler secret put ANTHROPIC_API_KEY
pnpm exec wrangler secret put OPENAI_API_KEY      # optional, voice + video transcription

# 4. Edit wrangler.toml -> ALLOWED_ORIGINS (your prod + local origins)

# 5. Deploy
pnpm exec wrangler deploy
# → note the URL: https://scrolls-ai-proxy.<your-account>.workers.dev
```

Then in `app/.env.production.local`:

```bash
NEXT_PUBLIC_AI_PROXY_URL=https://scrolls-ai-proxy.<your-account>.workers.dev
NEXT_PUBLIC_CLAUDE_PROXY_URL=https://scrolls-ai-proxy.<your-account>.workers.dev
NEXT_PUBLIC_SHORT_LINK_BASE=https://scrolls-ai-proxy.<your-account>.workers.dev
```

If you front the Worker with your apex domain (Cloudflare Route `<domain>/s/*` → Worker), set `NEXT_PUBLIC_SHORT_LINK_BASE=https://<domain>` instead — short links become `https://<domain>/s/<code>` and the QR code prints the prettier URL.

## Local dev

```bash
cp .dev.vars.example .dev.vars       # add ANTHROPIC_API_KEY
pnpm dev                              # → http://localhost:8787
# or, to test from another device on your LAN:
pnpm dev:lan
```

## Hardening

- **Origin allow-list** — non-allowed origins get 403 (CORS preflight + actual request)
- **Model pinned** to `claude-haiku-4-5-20251001`; `max_tokens` capped at 2048
- **Per-IP rate limit** — 60 req / 10 min (KV)
- **Short links signed** — every create / delete embeds `Action`, `Slug`/`Code`, `Target`, and `Issued: <iso>`; the Worker re-derives the address with `verifyPersonalMessageSignature` from `@mysten/sui/verify` and refuses replays older than 5 minutes
- **Target host allow-list** — by default only `scrolls.fun`, `*.scrolls.fun`, `*.wal.app`, and localhost can be the destination of a short link (override with `SHORT_LINK_ALLOWED_TARGETS`)
- **No request logging of message contents**

## Rotating keys

```bash
pnpm exec wrangler secret put ANTHROPIC_API_KEY    # paste new key
# then revoke the old key in the Anthropic console
```

Bundle is **~60 KiB gzipped** — well within the 1 MB Workers free-tier limit.
