# Scrolls Testing Guide

This is the trimmed manual test guide for the shipped product.

For deployment steps, use [DEPLOY.md](../DEPLOY.md). This file is only about getting the product running and verifying the important paths.

---

## 1. Current truth

- The canonical product lives in `app/`.
- AI generation, AI analysis, transcription, and short links depend on the Worker in `ai-proxy/`.
- Permanent storage is Walrus-backed.
- The shipped on-chain registry and policy flows currently point at Sui testnet.
- Respondents can submit without a wallet when anonymous responses are enabled.
- Wallet signatures on submissions are optional.

---

## 2. Prerequisites

You need:

1. An Anthropic API key for form generation and AI analysis.
2. An OpenAI API key if you want to test voice or video transcription.
3. A Sui wallet for creator flows.
4. Testnet SUI for the creator wallet if you want to exercise pointer, policy, and submission-reference transactions.
5. A second browser profile or incognito window for respondent testing.

---

## 3. Recommended local setup

### Terminal A: Worker

```bash
cd ai-proxy
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

Add keys to `.dev.vars` before testing AI features.

### Terminal B: app

```bash
cd app
pnpm install
cp .env.example .env.local
pnpm dev
```

At minimum, verify these public env vars:

```bash
NEXT_PUBLIC_AI_PROXY_URL=http://localhost:8787
NEXT_PUBLIC_CLAUDE_PROXY_URL=http://localhost:8787
```

If you want to test from another device, use the `dev:lan` scripts and replace `localhost` with your LAN IP.

---

## 4. Recommended validation run

Run these in order.

### 1. Landing page and AI hero

1. Open `/`.
2. Confirm the marketing page renders.
3. Enter a short form brief in the hero and generate a draft.
4. Repeat once with an attachment or voice input.

Expected result:

- The hero accepts prompt input.
- AI generation opens the builder with a real draft.
- Attachment and voice flows do not silently fail.

### 2. Builder and publish

1. In the builder, confirm you can add and edit fields.
2. Test at least these field types: short text, rich text, dropdown, star rating, file upload, and URL.
3. Publish a public form.

Expected result:

- Publish creates a Walrus-backed form.
- The success state exposes a working public link.
- The share modal can open the QR/share card flow.

### 3. Share path

1. Open the share link.
2. Open the QR/share card modal.
3. If configured, create a short slug.

Expected result:

- The public URL loads from the shared id.
- QR/share card export works.
- Short-link creation succeeds when the Worker is configured.

### 4. Walletless submission

1. Open the public form in an incognito or logged-out browser.
2. Submit one response without connecting a wallet.
3. Include at least one uploaded file if the form supports it.

Expected result:

- The form accepts a normal walletless response.
- Submission completes and shows a Walrus receipt.
- The response body and any attachment blobs exist on Walrus.

### 5. Signed submission

1. Open the same form with a connected wallet.
2. Leave the wallet-sign option enabled.
3. Submit a second response.

Expected result:

- The response stores a signature block.
- This is the best path for verifying the on-chain discovery flow during testing.

### 6. Private form

1. Publish a private form.
2. Submit a response to it.
3. Open the owner responses view.
4. Confirm decryption works in the browser.

Expected result:

- The response blob is encrypted.
- Plaintext is only visible after owner-side decryption.

### 7. Responses dashboard

1. Open `/responses?id=...` for the published form.
2. Confirm the inbox can load responses.
3. Add notes and set priority.
4. Trigger AI analysis if configured.
5. Export CSV or JSON.

Expected result:

- Notes and priority controls work.
- AI summary, sentiment, and topic clustering render when the Worker is reachable.
- Export succeeds without corrupting field values.

---

## 5. What to verify before a demo or submission

- One public form that works end to end
- One private form that decrypts correctly
- One walletless response
- One wallet-signed response
- One share card or QR flow
- One AI-generated draft
- One AI-analyzed response in the dashboard
- One successful CSV export

---

## 6. Common failure points

| Symptom | Usually means |
| --- | --- |
| AI generation fails immediately | Worker env vars or Anthropic key are missing |
| Voice flow fails | OpenAI key or transcription route is missing |
| Short-link creation fails | Worker or KV configuration is incomplete |
| Private response cannot be read | Owner key backup is missing or wrong |
| Dashboard does not show the response you expect | Test the signed-submit path too, not only anonymous submit |

---

## 7. Fast handoff checklist

If someone else needs to reproduce your test run, hand them:

1. The app URL
2. The Worker URL
3. The form URL you tested
4. The owner wallet address
5. One submission receipt blob id
6. Any transaction digests from publish or submission-reference flows
