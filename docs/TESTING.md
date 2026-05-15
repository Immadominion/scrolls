# Scrolls Testing and Deployment Guide

This is the canonical setup and manual test plan for Scrolls as the repo exists today.

## Current truth

- Full-fidelity testing today is **testnet-first**.
- Wallet support is **extension wallets only**. Do not plan around Enoki or Google login.
- The app already points at a published Scrolls Move package on **Sui testnet**:
  - Scrolls package: `0x6418bc0c11e75ef443f7e8fedb9a860b6cc3bfe5909481dc309472ad8b7b10a0`
  - Seal verifier package: `0x4016869413374eaa71df2a043d1660ed7bc927ab7962831f8b07efbc7efdb2c3`
- **Mainnet is not turnkey in this repo yet.** [app/src/lib/contracts.ts](../app/src/lib/contracts.ts) still has an empty `mainnet` Scrolls package id and no mainnet Seal committee config, so private forms and on-chain registry flows will not be complete on mainnet until you publish the Move package and wire those constants.

## What should be deployed

| Surface | Needed for local full testing | Needed for shared or hosted testing | Needed for bounty-style final deploy | Notes |
|---|---|---|---|---|
| `app/` | No, run `pnpm dev` locally | Yes, if you want a hosted URL | Yes | Build output is `app/out/` |
| `ai-proxy/` Cloudflare Worker | No, `wrangler dev` is enough | Yes | Yes | Required for AI form generation, AI analysis, and Whisper transcription |
| `move/scrolls` package | No for standard testnet testing | Only if you changed the Move code or want your own package id | Yes for mainnet private forms | Testnet package is already published and hardcoded |
| Walrus Site object | No | Optional | Yes | Needed only when you want the app served from Walrus Sites |
| SuiNS name | No | No | Recommended | Needed if you want a clean `wal.app` mainnet URL |

## What you need to do manually

### Accounts and keys

1. Create or have access to an **Anthropic API key**. This is required for AI form generation and `/analyze`.
2. Create or have access to an **OpenAI API key** if you want to test audio and video transcription through `/transcribe`.
3. Install a **Sui extension wallet**. Use two browser profiles or two wallets if you want to test owner/admin separation.
4. Fund the creator wallet with a small amount of **testnet SUI**. This is required for `createPolicy`, `publishForm`, `recordSubmission`, and `addAdmin` transactions on testnet.
5. If you want a deployed Worker, create a **Cloudflare account** and log in with `wrangler`.
6. If you want a Walrus Sites deploy, install the **Walrus CLI / site-builder** and configure a local Sui keystore. The repo does **not** currently ship a `site-builder.yaml`.

### Local files you must create or edit

1. Create `ai-proxy/.dev.vars` from `ai-proxy/.dev.vars.example`.
2. Create `app/.env.local` from `app/.env.example`.
3. If you want a production-style build, create `app/.env.production.local` from `app/.env.production.example` and then override values for the network you actually want to test.
4. If you deploy the Worker, edit `ai-proxy/wrangler.toml`:
   - replace `REPLACE_WITH_KV_NAMESPACE_ID`
   - set `ALLOWED_ORIGINS`
5. If you deploy the app to Walrus Sites, create `site-builder.yaml` manually from the official Walrus Sites docs. Deploy `app/out/`, not the repo root.

### Values you will need to choose

1. Which network you are testing on: **testnet is the recommended and fully wired path**.
2. Whether you want:
   - local app + local Worker
   - local app + deployed Worker
   - hosted app + deployed Worker
3. Which wallet addresses you will use for:
   - creator / owner
   - secondary admin
   - optional signed submitter

## What you need to provide to me

If you want me to help you debug or finish the testing run quickly, send these exact values after you set them up:

1. The target network: `testnet` or `mainnet`.
2. Whether you are testing on:
   - localhost only
   - localhost app + deployed Worker
   - deployed app + deployed Worker
3. The Worker URL, if deployed.
4. The Walrus site URL or site object id, if deployed.
5. The wallet addresses you want to use as:
   - owner
   - secondary admin
   - submitter
6. Whether you have an OpenAI key available for audio or video tests.
7. Any transaction digest or raw error text from failed steps.
8. If you publish your own Move package, the new package id and the network it was published on.

## Recommended setup for proper testing

This is the fastest path that exercises the real product without adding avoidable infrastructure risk.

### Option A: local app + local Worker

Use this for day-to-day product testing.

If you need to test from another device on the same network, do not use `localhost`. Use your Mac's LAN IP and the `dev:lan` scripts instead.

```bash
# Terminal A — AI proxy
cd ai-proxy
pnpm install
cp .dev.vars.example .dev.vars
# Fill ANTHROPIC_API_KEY
# Fill OPENAI_API_KEY only if testing audio/video transcription
pnpm dev:lan

# Terminal B — app
cd app
pnpm install
cp .env.example .env.local
pnpm dev:lan
```

Verify these values in `app/.env.local`:

```bash
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
NEXT_PUBLIC_AI_PROXY_URL=http://localhost:8787
NEXT_PUBLIC_CLAUDE_PROXY_URL=http://localhost:8787
```

For LAN testing from a phone, tablet, or second laptop, replace the proxy URLs with your Mac's LAN address:

```bash
NEXT_PUBLIC_AI_PROXY_URL=http://<your-mac-lan-ip>:8787
NEXT_PUBLIC_CLAUDE_PROXY_URL=http://<your-mac-lan-ip>:8787
```

Open the app from the second device with:

```text
http://<your-mac-lan-ip>:3000
```

Use two browser contexts:

1. Profile A: owner wallet connected.
2. Profile B or incognito: respondent and secondary-admin tests.

### Option B: local app + deployed Worker

Use this when you want Cloudflare parity for AI paths but do not need the app hosted yet.

```bash
cd ai-proxy
pnpm install
wrangler login
wrangler kv namespace create RATE_LIMIT
# Paste the returned id into wrangler.toml
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
# Set ALLOWED_ORIGINS to at least: http://localhost:3000
pnpm deploy
```

Then set both `NEXT_PUBLIC_AI_PROXY_URL` and `NEXT_PUBLIC_CLAUDE_PROXY_URL` in `app/.env.local` to the deployed `workers.dev` URL and restart the app.

### Option C: deployed app + deployed Worker

Use this only when you need a shareable QA or submission environment.

1. Deploy the Worker first.
2. Create `app/.env.production.local`.
3. Run `cd app && pnpm build`.
4. Create `site-builder.yaml` manually. This repo does not include one yet.
5. Deploy **only** `app/out/` with `site-builder`.

Important constraints:

- Walrus Sites **testnet** deployments are not visible on `wal.app`. For hosted testnet browsing you need a local or self-hosted portal.
- For **mainnet**, do not assume private-form testing is ready until you publish `move/scrolls` and fill the missing mainnet constants in [app/src/lib/contracts.ts](../app/src/lib/contracts.ts).

## Full manual testing flow

Run these in order. Do not skip the private-form path.

### 1. Boot check

1. Start the Worker.
2. Start the app.
3. Open `/`.

Expected result:

- The landing page loads.
- AI actions do not immediately fail with missing env errors.
- The Worker does not return `403 Origin not allowed` from `http://localhost:3000`.

### 2. Text-only AI form generation

1. On `/`, enter a plain-text brief such as `Bug report form for a mobile app with severity and screenshot upload`.
2. Trigger AI generation.
3. Confirm you land on `/builder` with a generated draft.

Expected result:

- A real draft appears.
- If Claude is unavailable, you get a real error state, not a fake fallback form.

### 3. Multimodal AI generation

1. Repeat generation with a screenshot or PDF attached.
2. Repeat by dragging a screenshot or document directly onto the landing-page composer.
3. Repeat again with a short audio clip or video clip.

Expected result:

- Image and document attachments influence the draft.
- Drag-and-drop and pasted image files are accepted as context on the landing-page composer.
- Audio and video are transcribed through `/transcribe` before Claude sees them.
- The builder status pill reports `Used N attachment(s)` and shows how many were transcribed.
- If `OPENAI_API_KEY` is absent, audio and video fail explicitly instead of silently disappearing.

### 4. Public-form publish and submit

1. Build a public form with `allowAnonymous` enabled.
2. Connect the owner wallet in Profile A.
3. Publish the form.
4. Open the share link in Profile B or incognito.
5. Submit one anonymous response.
6. If desired, submit a second response with a connected wallet to exercise the optional signature path.

Expected result:

- Publish uploads the form JSON to Walrus.
- If the on-chain registry is available, a `FormPointer` is created and the canonical id is a Sui object id.
- The responses page can load the submission.
- The raw submission blob opens on the Walrus aggregator.

### 5. Private-form publish and owner decrypt

1. Create a new form and enable `Private`.
2. Publish it from Profile A.
3. Record the resulting form URL and responses URL.
4. Submit at least two responses from Profile B or incognito.
5. Close the owner tab completely.
6. Re-open the responses page in a fresh tab with the owner wallet connected.

Expected result:

- Publish creates a `FormPolicy` on chain before the form is uploaded.
- Submission blobs on Walrus are ciphertext, not plaintext JSON.
- The owner can still decrypt after reopening the page.
- The `Decrypted` filter shows the unlocked rows.

### 6. Admin add and cross-account decrypt

1. In Profile A, open the admin panel for the private form.
2. Add the secondary admin wallet address.
3. In Profile B, connect that wallet and open the same responses page.
4. Confirm the secondary admin can decrypt.
5. Remove that admin again.

Expected result:

- `addAdmin` succeeds on chain.
- The secondary admin can decrypt while approved.
- After removal, new decrypt attempts should fail.

### 7. AI triage and local admin metadata

1. Decrypt a private submission.
2. Trigger analysis if it did not auto-run.
3. Confirm row-header chips appear for sentiment, topic, and suggested priority.
4. Override the priority manually.
5. Add admin notes.
6. Refresh the page.

Expected result:

- AI analysis is cached locally by submission blob id.
- Manual priority override wins over AI suggested priority.
- Notes and priority persist in local storage for that browser.

### 8. Export and proof-of-permanence checks

1. Use `Copy submission link` on one row.
2. Open the copied Walrus URL directly.
3. Download JSON export.
4. Download CSV export.

Expected result:

- The copied link resolves to the raw Walrus blob.
- CSV includes only decrypted rows.
- JSON includes the full export payload and indicates any rows that stayed locked.

### 9. Cross-device discovery

1. In a fresh browser profile, connect the owner wallet.
2. Open `/dashboard`.
3. Open the form and responses page from that profile.

Expected result:

- The published form is discovered from on-chain `FormPublished` events.
- Response counts catch up from on-chain `SubmissionRecorded` events.
- The form remains usable even if the original browser-local draft index is absent.

### 10. Failure-path checks

1. Stop the Worker and try AI generation again.
2. Remove `OPENAI_API_KEY` and test audio or video input.
3. If you deployed the Worker, hit it from a disallowed origin.

Expected result:

- AI generation and analysis fail loudly with actionable errors.
- Audio/video transcription returns an explicit error when Whisper is unavailable.
- The deployed Worker returns `403` for non-allowed origins.

### 11. Final hosted smoke run

Run this only after the local test flow is green.

1. Deploy the Worker.
2. Build the app.
3. Deploy `app/out/`.
4. Update Worker `ALLOWED_ORIGINS` with the final hosted origin.
5. Repeat this exact flow once on the hosted URL:
   - prompt
   - generate
   - publish
   - submit
   - decrypt
   - add admin

Expected result:

- The hosted environment behaves the same as localhost for the core path.

## Artifacts to capture during testing

Save these as you go. They are the fastest way for me to help if something breaks.

1. Worker URL.
2. Form URL.
3. Responses URL.
4. `pointerId`.
5. `policyId` for private forms.
6. One submission blob URL.
7. Transaction digests for:
   - `createPolicy`
   - `publishForm`
   - `recordSubmission`
   - `addAdmin`
8. Screenshot or raw text of any failure.

## What does not need deployment for normal testing

- You do **not** need to deploy the app just to test it fully. Localhost is the recommended path.
- You do **not** need to deploy `move/scrolls` if you stay on testnet and use the package id already wired in the repo.
- You do **not** need Enoki or Google OAuth.
- You do **not** need a database or backend server.

## Recommended order of operations

1. Get Option A working.
2. Run the full manual flow locally.
3. Switch to Option B if you want Cloudflare parity.
4. Only then do Option C for hosted QA or submission.
