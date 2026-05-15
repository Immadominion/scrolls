# Deployment Notes

This document captures the current production deployment path and the practical findings from local, testnet, and custom-domain research.

## Current shape

Use this architecture for a real launch:

- `app/` deploys as a Walrus Site.
- `scrolls.fun` points to a self-hosted Walrus portal.
- Railway hosts that portal.
- `ai-proxy/` stays on Cloudflare Workers unless it is explicitly ported away from the Worker runtime.
- Sui Move + Seal stay on-chain.

This keeps the product Walrus-native while avoiding a SuiNS purchase.

## What Railway should host

Railway should host the Walrus portal, not the app bundle itself.

If `app/out` is deployed directly to Railway, that becomes a normal hosted static site. It still works, but it is no longer the Walrus-native deployment path.

The intended request flow is:

1. Browser opens `https://scrolls.fun`.
2. Railway-hosted portal resolves the Walrus Site object from Sui.
3. Portal serves Walrus-hosted assets.
4. Browser still talks directly to Walrus, Sui, and the Cloudflare Worker.

## What is already ready

- The frontend already builds as a static export from `app/out`.
- The Move package exists at `move/scrolls`.
- Testnet publication metadata already exists in `move/scrolls/Published.toml`.
- The app already uses the registry and Seal flows on testnet.
- The Worker already supports analysis and transcription.

## Remaining mainnet blockers

These still need to be completed before a truthful mainnet launch:

1. Publish the Scrolls Move package to mainnet.
2. Fill `SCROLLS_PACKAGES.mainnet` in `app/src/lib/contracts.ts`.
3. Fill the mainnet Seal key-server configuration in `app/src/lib/contracts.ts`.
4. Replace the placeholder KV namespace id in `ai-proxy/wrangler.toml`.
5. Set the final production `ALLOWED_ORIGINS` in `ai-proxy/wrangler.toml`.
6. Tighten the production CSP once the final hostnames are fixed.

## Recommended order of operations

Do not go straight to mainnet.

1. Run the full local and testnet smoke test first.
2. Fix the remaining mainnet config gaps.
3. Deploy the Cloudflare Worker.
4. Publish the Move package to mainnet.
5. Build and deploy the Walrus Site.
6. Deploy the self-hosted portal to Railway.
7. Point `scrolls.fun` at Railway.
8. Lock Worker CORS to the final production domain.
9. Run a full production smoke test on the final domain.

## Local and LAN testing

If another device on your network loads `localhost`, it is loading itself, not your Mac.

Use the machine's LAN IP instead.

New helper scripts are available:

```bash
# App
cd app
pnpm dev:lan

# Worker
cd ai-proxy
pnpm dev:lan
```

Then open the app from the second device using:

```text
http://<your-mac-lan-ip>:3000
```

If the app needs to call the local AI proxy from another device, the app must also point to the LAN address, not `localhost`:

```text
NEXT_PUBLIC_CLAUDE_PROXY_URL=http://<your-mac-lan-ip>:8787
```

## Worker deployment

High-level deployment flow:

```bash
cd ai-proxy
pnpm install
wrangler login
wrangler kv namespace create RATE_LIMIT
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler deploy
```

Production `ALLOWED_ORIGINS` should include the final domain, for example:

```toml
ALLOWED_ORIGINS = "http://localhost:3000,https://scrolls.fun,https://www.scrolls.fun"
```

## Move package publication

High-level mainnet publish flow:

```bash
cd move/scrolls
sui client switch --env mainnet
sui client publish --gas-budget <your-budget>
```

After publishing:

1. Save the mainnet package id.
2. Save the upgrade capability id.
3. Update `app/src/lib/contracts.ts`.

## Walrus Site deployment

Build the static app first:

```bash
cd app
pnpm install
pnpm build
```

Install the Walrus site builder if needed:

```bash
curl -sSfL https://raw.githubusercontent.com/Mystenlabs/suiup/main/install.sh | sh
suiup install site-builder@mainnet
```

Create the Walrus sites config:

```bash
mkdir -p ~/.config/walrus
curl https://raw.githubusercontent.com/MystenLabs/walrus-sites/refs/heads/mainnet/sites-config.yaml -o ~/.config/walrus/sites-config.yaml
```

Deploy the static export:

```bash
cd app
site-builder --config ~/.config/walrus/sites-config.yaml --context mainnet deploy --epochs 10 ./out
```

Save the returned site object id. Reuse that object id on later updates:

```bash
site-builder --config ~/.config/walrus/sites-config.yaml --context mainnet deploy --object-id 0xYOUR_SITE_OBJECT_ID --epochs 10 ./out
```

## Railway portal for `scrolls.fun`

Use Railway for a small containerized Walrus portal.

Example `Dockerfile`:

```dockerfile
FROM mysten/walrus-sites-server-portal:mainnet-vX.Y.Z
COPY portal-config.yaml /portal-config.yaml
ENV PORTAL_CONFIG=/portal-config.yaml
EXPOSE 3000
```

Example `portal-config.yaml`:

```yaml
network: mainnet
site_package: "0x26eb7ee8688da02c5f671679524e379f0b837a12f1d1d799f255b7eea260ad27"
landing_page_oid_b36: "YOUR_SITE_BASE36_ID"
domain_name_length: 21
b36_domain_resolution: true
bring_your_own_domain: true
enable_blocklist: false
enable_allowlist: false

rpc_urls:
  - url: https://fullnode.mainnet.sui.io
    retries: 2
    metric: 100

aggregator_urls:
  - url: https://aggregator.walrus-mainnet.walrus.space
    retries: 3
    metric: 100
```

Use the same site-builder version family as the portal image.

Convert the Walrus Site object id to base36 before filling `landing_page_oid_b36`:

```bash
site-builder convert 0xYOUR_SITE_OBJECT_ID
```

## DNS and domain notes

Railway custom domains require both:

- a CNAME-style target provided by Railway
- a TXT record for ownership verification

For the root domain, your DNS provider must support either:

- CNAME flattening, or
- ALIAS / ANAME records

Cloudflare supports this, so apex `scrolls.fun` is viable there.

If your DNS provider does not support apex flattening or ALIAS records, use `www.scrolls.fun` on Railway and redirect the root domain.

## Production smoke test

After everything is deployed, run this sequence on the real domain:

1. Open `https://scrolls.fun`.
2. Generate a form with AI.
3. Publish a public form.
4. Submit from another browser or device.
5. Publish a private form.
6. Submit private responses.
7. Decrypt as owner.
8. Add a second admin.
9. Decrypt as that admin.
10. Verify copied Walrus links.
11. Verify analysis and transcription requests succeed from the final domain.

## Practical conclusion

The best path with the current repo is:

1. Keep the frontend as a Walrus Site.
2. Keep the AI proxy on Cloudflare Workers.
3. Use Railway only for the self-hosted Walrus portal.
4. Use `scrolls.fun` without buying SuiNS.
