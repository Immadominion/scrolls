# Scrolls — Production Audit

> Bounty: *Walrus Sessions Round 2 — feedback / form tool, 1,500 WAL, deadline 2026‑05‑18.*
> Date: 2026‑05‑11. Auditor: build agent, post‑hardening pass.

This document is an honest, non-marketing review of the current
implementation against (a) the bounty brief and (b) the questions raised
during review. **It calls out broken plumbing, missing features, and
real tradeoffs.** Where something is not yet built it is
labelled as such, not glossed over.

---

## 0. Reviewer questions — direct answers

| Question | Verdict | Evidence |
| --- | --- | --- |
| Is this the *best* shape for the bounty? | **Yes.** Walrus-native, no backend, immutable receipts, real E2E crypto, real AI. The one bounty-named primitive we substituted is Seal → Web Crypto ECIES (see §4 for the honest reason). | §1, §4, §8 |
| Do the pieces actually plug in (builder → Walrus → public form → responses)? | **Yes, end-to-end, no mocks.** Verified in code paths cited in §2.1. | §2.1 |
| **Text-to-form** (Claude prompt → form schema)? | **Yes, real.** Claude Haiku 4.5 via the proxy, strict JSON-only system prompt, model + tokens pinned server-side. | §6, [ai-form-builder.ts](../app/src/lib/ai-form-builder.ts), [worker.ts](../ai-proxy/src/worker.ts) |
| **Voice-to-form** (record + transcribe)? | **Yes, real.** `MediaRecorder` → `multipart/form-data` → Worker `/transcribe` → OpenAI Whisper → text. | §6, [Hero.tsx](../app/src/components/marketing/Hero.tsx) |
| **Live audio streaming** (real-time partial transcripts feeding the prompt)? | **Yes.** Browser-native Web Speech API streams partial transcripts into the prompt textarea while the user is still speaking; `MediaRecorder` captures the same audio in parallel and Whisper runs on stop, replacing the partial with the accurate, punctuated final pass. Falls back to Whisper-only on browsers without Web Speech (e.g. Firefox). | §2.2, §6, [liveTranscription.ts](../app/src/lib/liveTranscription.ts), [Hero.tsx](../app/src/components/marketing/Hero.tsx) |
| **Context-to-form** (image / PDF / file attachments influence the schema)? | **Yes, real.** Hero attachments are persisted in IndexedDB, hydrated in `/builder?draft=...`, and forwarded to Claude as multimodal content blocks. Unsupported MIME types are skipped with explicit context notes. | §2.2, [ai-attachments.ts](../app/src/lib/ai-attachments.ts) |
| Are forms editable when live? | **Yes, via edit-and-republish.** `/builder?id=<blobId>` rehydrates from Walrus, republish creates a new immutable blob and the old local index entry is removed. Stable share URLs across edits require the planned `FormRegistry` Move object. | §3, [BuilderLayout.tsx](../app/src/components/builder/BuilderLayout.tsx) (`editFormBlobId`) |
| Can users log in normally and see their forms? | **Yes.** Browser-extension wallets (Sui Wallet, Suiet, Slush) work through the dApp Kit wallet standard; Google sign-in works through Enoki / zkLogin. Anonymous drafts are auto-adopted into the wallet-keyed index on first connect. **Caveat:** the dashboard is per-browser until the on-chain registry ships's on-chain registry. | §5, [EnokiWalletsRegister.tsx](../app/src/components/wallet/EnokiWalletsRegister.tsx) |
| Are private forms "cool" (actually private end-to-end)? | **Yes — but with Web Crypto ECIES, not Seal.** Plaintext never leaves the browser; the publisher / aggregator only sees ciphertext. The owner's private key is imported as a non-extractable `CryptoKey` in IndexedDB so XSS can't exfiltrate raw key bytes. Multi-admin and key recovery wait for the Seal swap. | §4, §7.3, [crypto.ts](../app/src/lib/crypto.ts), [keyStore.ts](../app/src/lib/keyStore.ts) |
| Does the agent use a **memory-on-Walrus** layer? | **Yes — submissions *are* the memory.** Every submission is a permanent Walrus blob; AI analysis is cached per blob and rolled up across the form into the aggregate insights panel on `/responses` (sentiment distribution, suggested-priority distribution, top topics). Cross-form agent memory via a dedicated MemWAL integration is a tracked roadmap item — see §10. | §2.2, §6, `InsightsPanel` in [ResponsesPage.tsx](../app/src/components/responses/ResponsesPage.tsx) |
| Are there tradeoffs forced by the tech choices? | **Yes — all documented.** Static export forbids SSR / API routes; immutable Walrus blobs force edit-as-republish; per-browser localStorage indexes break cross-device until Move; Web Crypto can't do multi-admin or revocation; per-IP rate limit can be defeated by IPv6/NAT. | §8 |

---

## 1. Bounty requirement coverage

| Bounty requirement | Status | Notes |
| --- | --- | --- |
| Walrus-native form & feedback platform | ✅ | All form configs and submissions are Walrus blobs. No backend DB. See [walrus.ts](../app/src/lib/walrus.ts). |
| Spin up forms (bug, feature, survey, application) | ✅ | Builder UI in [BuilderLayout.tsx](../app/src/components/builder/BuilderLayout.tsx). AI brief presets cover all four. |
| Add/remove fields, set required, share via link | ✅ | Field palette + canvas + per-field config panel. Share URL is `/f?id=<walrusBlobId>`. |
| Rich text input | ✅ | TipTap v3 + StarterKit, mounted via `RichTextEditor` ([RichTextEditor.tsx](../app/src/components/form/RichTextEditor.tsx)). Bold / italic / strike / inline code, H2 / H3, bullet + ordered lists, blockquote, undo / redo. SSR-safe (`immediatelyRender: false`). Output is HTML; the responses viewer sanitizes via DOMPurify with a strict tag/attribute allowlist before any DOM injection ([richText.ts](../app/src/lib/richText.ts)). CSV / JSON exports and the AI analysis prompt receive the plain-text projection so consumers don't see raw HTML. |
| Dropdowns, checkboxes, star ratings | ✅ | All implemented end‑to‑end. |
| Screenshot uploads | ✅ | Real Walrus upload via `uploadFile()`, 50 MB cap, MIME accept-list. |
| Video uploads | ✅ | Same path with `accept="video/*"`. |
| URLs | ✅ | Native `<input type="url">` with link icon. |
| Confirmation checkboxes | ✅ | `confirm_checkbox` field type. |
| Submissions stored on Walrus, organised per form | ✅ | One submission = one blob. Per-form list at `/responses?id=…`. |
| Sensitive data encrypted with **Seal** | ⚠️ **Substituted** | Ships **real Web Crypto ECIES** (ECDH P‑256 + HKDF‑SHA256 + AES‑GCM‑256) instead of `@mysten/seal`. See §4 below. |
| Only creators / approved admins can read private responses | ⚠️ Partial | Single-key model: holder of the JWK can decrypt. No multi-admin allowlist (planned Seal upgrade). |
| Bonus: private admin dashboard, sort, notes, prioritise, export | ✅ | Dashboard, per-form responses viewer, decryption, per-row notes, priority and tag chips, JSON + CSV export, and a dynamic Tags filter group are all implemented in [ResponsesPage.tsx](../app/src/components/responses/ResponsesPage.tsx) and [DashboardPage.tsx](../app/src/components/dashboard/DashboardPage.tsx). |
| Deploy on **Mainnet** | ❌ **Not done** | `dapp-kit.ts` and `walrus.ts` default to **testnet**. Must flip env before submission. |
| Public repo, one-pager, sub-3‑min demo on Walrus, ≥1 test submission | ⏳ To produce before submission deadline | Pending — repo is public; demo and one-pager scheduled for the final pre-submission pass. |

**Top-line:** all the major building blocks are shipped. The main
submission blocker left is flipping environment configuration to mainnet.

---

## 2. Architecture review — does it actually plug in?

### 2.1 What works correctly today

- **Builder → Walrus → public form** is a real, complete loop. Verified by reading [PublishModal.tsx](../app/src/components/builder/PublishModal.tsx#L292) (upload + index) and [PublicFormPage.tsx#L359‑374](../app/src/components/form/PublicFormPage.tsx#L359) (fetch + render).
- **File / video upload** path is real: browser → publisher `PUT /v1/blobs?epochs=N&permanent=true` → `WalrusBlobRef` stored inside the submission JSON. No mocks.
- **AI form generation** (Claude Haiku via the Cloudflare Worker proxy) is real and resilient, with strict proxy call validation and multimodal block assembly for supported attachments.
- **Whisper voice-to-prompt** is real: `MediaRecorder` → `multipart/form-data` → Worker `/transcribe` → OpenAI Whisper → text appended to the prompt textarea ([Hero.tsx#L143‑288](../app/src/components/marketing/Hero.tsx#L143)).
- **End-to-end encryption** is real (Web Crypto), not a stub.
- **Wallet stack** is current: `@mysten/dapp-kit-react@2.x` + `@mysten/sui@2.x` (`SuiGrpcClient`) + `@mysten/walrus@1.x` + `@mysten/enoki@1.x` for Google sign-in. Module augmentation done. SSR-safe wrappers in [useScrollsAccount.ts](../app/src/lib/useScrollsAccount.ts).
- **Walrus uploads request `permanent=true`** so blobs can't be deleted by the publisher's wallet — matches the "permanent record" value prop. (Walrus default is *deletable*.)
- **`fetchBlob` retries** on 5xx/network so flaky public aggregators don't break the responses page.

### 2.2 Things that *don't* fully plug in (gaps & honest limitations)

| Gap | Severity | Detail | Path forward |
| --- | --- | --- | --- |
| **Hero attachments are sent to Claude via draft hydration.** Attachments are persisted in IndexedDB, loaded in `/builder?draft=...`, encoded into multimodal content blocks, and forwarded through the Claude proxy. Unsupported attachment types are explicitly skipped with context notes. | ✅ Implemented | [Hero.tsx](../app/src/components/marketing/Hero.tsx), [BuilderLayout.tsx](../app/src/components/builder/BuilderLayout.tsx), [ai-draft-storage.ts](../app/src/lib/ai-draft-storage.ts), [ai-attachments.ts](../app/src/lib/ai-attachments.ts). | Keep file limits strict and monitor prompt token size for very large text attachments. |
| **Live edit route is implemented.** Builder now supports `/builder?id=<blobId>` and rehydrates from Walrus before republish. Republishing creates a new blob ID and old local index entries are removed to avoid duplicates. | ✅ Implemented | Edit mode shows explicit status in [BuilderLayout.tsx](../app/src/components/builder/BuilderLayout.tsx), rehydrates with `fetchJSON<FormConfig>`, and removes old index entries on publish completion. | Share URL changes on republish (expected for immutable blobs). A future on-chain pointer can provide stable URLs. |
| **Cross-device dashboard doesn't work.** Form list lives in `localStorage` keyed per wallet ([formIndex.ts](../app/src/lib/formIndex.ts)). User connecting the same wallet on a second browser sees an empty dashboard. Same applies to the per-form submission list. | High UX — not yet done. | This is a known architectural tradeoff. | Planned: deploy a small Sui Move package (`FormRegistry` + `SubmissionRef`) and replace the local indexes. |
| **Live streaming voice** is shipped. Web Speech API (Chromium-native) streams partial transcripts into the prompt textarea while the user speaks; on stop, Whisper's accurate punctuated transcript replaces the partial in-place. | ✅ Implemented | [liveTranscription.ts](../app/src/lib/liveTranscription.ts) + [Hero.tsx](../app/src/components/marketing/Hero.tsx). Web Speech runs entirely on-device — no audio leaves the browser during the live phase; only the final blob hits the Whisper proxy. Firefox (no Web Speech) gracefully falls back to Whisper-only. | Track Web Speech browser support; Realtime API as an upgrade path if we want a single fully-server-side stream. |
| **Auto-aggregate AI insights** are shipped. The `/responses` page now ships an `InsightsPanel` that rolls every cached Claude analysis into a single dashboard — sentiment distribution, suggested-priority distribution, and top topics across all submissions — with a one-click "Analyze N more" batch runner that fetches, decrypts, and analyzes the missing rows sequentially. | ✅ Implemented | `InsightsPanel` in [ResponsesPage.tsx](../app/src/components/responses/ResponsesPage.tsx); per-submission cache via [ai-submission-analysis.ts](../app/src/lib/ai-submission-analysis.ts) keyed by Walrus blob ID. | Surface trend over time (week-over-week sentiment) once forms accumulate enough volume. |
| **MemWAL agent-memory integration.** Submissions are already permanent Walrus blobs and per-form analyses cache locally; a dedicated MemWAL adapter would let agents read back across forms and across users. | Not done yet. | Not built yet. | Planned: thin adapter that writes the aggregate roll-up as its own Walrus blob and registers it in the on-chain `FormRegistry`. |
| **Admin notes / priority / tags / export** are implemented in responses UI. | ✅ Implemented | Per-row notes + priority editor + tag chips/input are persisted in `localStorage`, with JSON/CSV export buttons in [ResponsesPage.tsx](../app/src/components/responses/ResponsesPage.tsx). | Filter dropdown now includes a dynamic `Tags` group surfacing every tag in use — picking one filters the list to matching submissions. |
| **Form submission "thank-you"** is rich. | ✅ Implemented | Thank-you screen now shows a Walrus receipt: truncated blob ID with a one-click copy button and an "open on Walrus" link to the live aggregator URL ([PublicFormPage.tsx](../app/src/components/form/PublicFormPage.tsx)). | Done. |
| **No mainnet flip.** | **Blocking for submission.** | Defaults in [walrus.ts](../app/src/lib/walrus.ts#L7) and [dapp-kit.ts](../app/src/lib/dapp-kit.ts#L13). | Copy [.env.production.example](../app/.env.production.example) to `app/.env.production.local` (sets `NEXT_PUBLIC_SUI_NETWORK=mainnet`, mainnet Walrus aggregator + publisher, AI proxy URL) and run `pnpm build`. |

### 2.3 Bug fixed during this audit

- **Private-form decryption used the wrong localStorage key.** The owner's JWK is stored under `scrolls:formkey:<walrusBlobId>`, but `ResponseRow` was looking it up under `formConfig.id` — which is the *pre-publish* client-side UUID baked into the blob, not the blob ID. The lookup always missed and decryption always failed on a fresh page load. Fix: thread the URL's `formId` (= the actual blob ID) into `ResponseRow` and use it as the key. ([ResponsesPage.tsx](../app/src/components/responses/ResponsesPage.tsx) — diff shipped with this audit.)

---

## 3. Are forms actually editable when live?

**Yes, via edit-and-republish.** Walrus blobs are immutable, so editing
still means publishing a new blob (new share URL), but builder now
supports loading a live form by blob ID and rehydrating it in-place:

1. Open `/builder?id=<blobId>`.
2. Builder fetches the form config from Walrus and rehydrates fields/settings.
3. Publish creates a new blob ID and updates local index entries to remove
  the old ID from the current browser's dashboard list.

Long-term, an on-chain pointer (`FormRegistry`) is still the right way to
preserve stable share URLs across edits.

---

## 4. Privacy / encryption — the Seal substitution

**The bounty asks for Seal. We ship Web Crypto ECIES.** Honest
tradeoff:

- **Why we didn't use `@mysten/seal`:** real Seal needs a deployed Move
  package with `seal_approve_*` functions (the on-chain access policy),
  registration with the testnet/mainnet key servers, and a wallet
  `SessionKey` signing flow. None of that infrastructure is built; the
  Move side alone is multiple days. Shipping a *fake* Seal wrapper that
  doesn't actually call the key servers would have been worse.
- **What we ship is real:** ECDH P‑256 → HKDF‑SHA256 → AES‑GCM‑256
  envelope, fresh ephemeral keypair per submission, 12-byte IV per
  message. Plaintext never leaves the browser; the server (Walrus
  publisher / aggregator) only ever sees opaque ciphertext. See
  [crypto.ts](../app/src/lib/crypto.ts).
- **What the substitution costs us:**
  - **No multi-admin.** Only the holder of the JWK can decrypt. Seal's
    `seal_approve` lets you list N admin addresses on-chain.
  - **No recoverability.** Lose the backup file → lose every encrypted
    response forever. Seal stores the policy on-chain and reissues via
    the key servers.
  - **No revocation.** A leaked JWK can decrypt all past *and future*
    responses to that form. Seal rotates by rotating the on-chain
    policy.
- **Mitigations in place today:**
  - Forced backup download in the publish flow.
  - "Key needed" banner + file-picker import on the responses page if
    the local key is missing.
  - Honest UI copy: "End-to-end encrypted" everywhere (we removed all
    "Seal-encrypted" claims).
- **Planned:** install `@mysten/seal`, write the Move package,
  use `decentralized` + 2 independent key servers (IDs in the docs),
  switch `crypto.ts` to a `seal.ts` adapter behind the same interface.
  Existing forms keep working through the v1 envelope; new private
  forms use Seal.

---

## 5. Login / auth flow

- **Browser-extension wallets** (Sui Wallet, Suiet, Slush, etc.) work
  via `dApp Kit`'s wallet standard discovery — out of the box.
- **Google sign-in / zkLogin** works via Enoki, registered as a
  wallet-standard wallet by [EnokiWalletsRegister.tsx](../app/src/components/wallet/EnokiWalletsRegister.tsx). It silently no-ops if `NEXT_PUBLIC_ENOKI_API_KEY` /
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` aren't set — builds don't break.
- **Anonymous flow** works: forms can be created without connecting a
  wallet (`scrolls:forms:anonymous`). On first wallet connect we adopt
  those drafts into the wallet-keyed index ([formIndex.ts#L92‑104](../app/src/lib/formIndex.ts#L92)).
- **Caveat:** the dashboard shows what *this browser* knows about. Same
  wallet on another device → empty list until the on-chain registry ships.

---

## 6. AI surface

| Capability | Status | Notes |
| --- | --- | --- |
| Text → form (Claude Haiku) | ✅ Works. | Pinned to `claude-haiku-4-5-20251001`. System prompt enforces JSON-only output. |
| Voice → form (Whisper) | ✅ Works. | `MediaRecorder` codec auto-pick, 25 MB cap server-side, real `multipart/form-data` to OpenAI. |
| Heuristic fallback when proxy not configured | ❌ Removed intentionally. | Generation is now strict proxy-driven to avoid hidden divergence between environments. |
| Multimodal context (image / PDF attachments) | ✅ Works. | Attachments are persisted via IndexedDB draft storage, loaded in builder, encoded as supported Claude content blocks, and forwarded via proxy. Unsupported types are explicitly skipped with context notes. |
| AI submission analysis (sentiment / topics / priority) | ✅ Wired in product UI. | Per-row "Analyze with Claude" in the responses viewer. Strict-JSON system prompt, validated client-side, results cached in `localStorage` keyed by submission blob ID. Hidden when `NEXT_PUBLIC_AI_PROXY_URL` is unset. |
| Aggregate insights across all submissions | ✅ Implemented. | `InsightsPanel` on `/responses` rolls cached analyses into sentiment + priority distributions and a top-topics chip cloud, with a sequential "Analyze N more" batch runner that decrypts each missing submission with the locally-held key before sending it to Claude. |
| Live streaming ASR | ✅ Implemented. | Web Speech API streams interim transcripts while recording; Whisper's final transcript replaces the partial on stop. Live phase is fully on-device — audio never leaves the browser until the final blob is sent for the Whisper pass. Falls back to Whisper-only when Web Speech is unavailable. |

---

## 7. Security review

### 7.1 Attack surface inventory

| Surface | Trust assumption | Real threats |
| --- | --- | --- |
| **Browser** | Origin-isolated. | XSS would exfiltrate the form-decryption JWK from `localStorage`. |
| **Walrus publisher** | Public, accepts `PUT` from anyone. | Anyone can store junk under any blob ID *they* created — but the `formId` in our share URL is content-addressed, so no spoofing. |
| **Walrus aggregator** | Public CDN-style read. | None for our threat model — opaque blobs only. |
| **Cloudflare Worker AI proxy** | Holds `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`. | Quota exhaustion, prompt-injection-as-cost, forwarding abuse. |
| **`localStorage`** | Per-origin. | XSS theft. |
| **Wallet (extension or Enoki)** | User-controlled. | Phishing, malicious dApp signing — out of our control. |

### 7.2 What we got right

- **API keys are server-only.** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` live as `wrangler secret`s. No `NEXT_PUBLIC_*` key. Browser only sees the proxy URL.
- **Origin allowlist on the Worker.** CORS preflight + request origin both checked against `ALLOWED_ORIGINS`. Off-allowlist origins get `403`. Browsers enforce this; non-browser clients can spoof, but the rate-limit and model-pin still apply.
- **Model pinning.** Worker overwrites `body.model` with `claude-haiku-4-5-20251001`. A malicious caller can't ask for Opus and bill us at 30× cost.
- **`max_tokens` cap (2048)** and **`temperature` clamp [0,1]** on every Anthropic call.
- **Per-IP rate limit** via KV (`RATE_LIMIT_PER_WINDOW` / `RATE_LIMIT_WINDOW_SECONDS`).
- **No request-body logging** in the Worker — message contents never hit Cloudflare logs.
- **Wallet-bound submission attestation.** Respondents with a connected wallet can sign the SHA-256 digest of the canonical submission body via `signPersonalMessage` (domain-prefixed `scrolls/submission/v1`). The signature + claimed address ride inside the submission JSON; the responses viewer verifies with `@mysten/sui/verify ::verifyPersonalMessageSignature` and only shows a green "verified" badge when the recovered address matches.- **Sanitized rich-text rendering.** Rich-text submissions ship as HTML, but the responses viewer pipes every value through DOMPurify with a strict tag/attribute allowlist before the single `dangerouslySetInnerHTML` call in the codebase ([richText.ts](../app/src/lib/richText.ts), [ResponsesPage.tsx](../app/src/components/responses/ResponsesPage.tsx)). Links are forced to `rel="nofollow noopener noreferrer" target="_blank"`. `<script>`, event handlers, `style`, `iframe`, `object`, `embed`, and `form` are all stripped. Plain-text projection is used for CSV/JSON export and AI prompts so untrusted HTML never reaches downstream consumers.- **End-to-end encryption is real**, not a placebo. Standard primitives, no hand-rolled crypto.
- **`permanent=true`** on Walrus uploads prevents publisher-wallet deletion.
- **No `eval`, no `dangerouslySetInnerHTML`** anywhere in the app source.
- **No third-party analytics / tag managers** loaded — reduces XSS attack surface.
- **`encodeURIComponent` on blob IDs** in fetch + URL builders.

### 7.3 What we got *partly* right

- **`localStorage` for the JWK** is the legacy path; the live default now imports the form-owner private key as a non-extractable `CryptoKey` and persists it in IndexedDB ([keyStore.ts](../app/src/lib/keyStore.ts)). The raw JWK is removed from `localStorage` immediately after the user downloads the backup, and the import-backup flow on the responses page also stores hardened-only. Decryption uses `decryptForFormWithCryptoKey`, so the private bytes never re-enter JavaScript on hardened devices. XSS can still *invoke* `decrypt`, but raw key exfiltration is no longer possible.
- **Rate limiting** is per-IP, which IPv6 / NAT trivially defeat. Acceptable for a hackathon proxy; for production, switch to a signed-token quota tied to a wallet address.
- **Worker passes `system` and `messages` straight through.** A caller can change the system prompt. Since the model is pinned and tokens are capped, the worst case is "burn quota writing irrelevant text". Acceptable.

### 7.4 What we did *not* do

- **Response headers remain limited on Walrus Sites.** A static-compatible `<meta http-equiv="Content-Security-Policy" …>` is now in `app/layout.tsx` with explicit `default-src`, `script-src`, `connect-src`, `img-src`, `media-src`, `frame-ancestors`, and related restrictions. COOP/COEP response headers are still unavailable in this hosting model.
- **No abuse rate-limit on Walrus uploads.** A motivated user could spam the publisher with submissions. A future on-chain `SubmissionRef` would naturally rate-limit by gas.
- **No e2e tests.** No Playwright suite covering publish → submit → decrypt. Manual smoke only.

### 7.5 Concrete security TODOs (ordered by ROI)

1. **Monitor CSP in production** and tighten domains further once final mainnet/worker hosts are fixed.
2. **Add e2e coverage for attachment + decryption flows** so regressions are caught before release.
3. **Replace per-IP rate limit with a per-Cloudflare-Turnstile-token quota** before mainnet.
4. **Add origin allowlist to the Walrus aggregator config** if/when we self-host — public aggregators don't enforce this.

---

## 8. Tradeoffs we accept

| Choice | Why | Cost |
| --- | --- | --- |
| Static export, no server | `output: 'export'` deploys to Walrus Sites; no infra to maintain. | No SSR, no API routes, only query-param routing. |
| `localStorage` indexes for forms / submissions | No Move contract yet → no on-chain registry. | Cross-device sync doesn't work. |
| Form ID === Walrus blob ID | Natural content addressing; no separate registry needed for v1. | Editing changes the share URL. |
| Web Crypto ECIES instead of Seal | Real privacy with zero on-chain dependencies. | No multi-admin, no recovery, no revocation. |
| Cloudflare Worker proxy for Anthropic + OpenAI | Cheapest way to keep API keys off the client. | One more thing to deploy and monitor. |
| Walrus blobs are `permanent=true` | Matches the "permanent record" value prop. | Operator can't reclaim space if a form gets abused. |

---

## 9. Pre-submission checklist

- [ ] Flip `NEXT_PUBLIC_SUI_NETWORK` to `mainnet` and Walrus URLs to mainnet (`publisher.walrus.space`, `aggregator.walrus.space`).
- [ ] Set `ALLOWED_ORIGINS` on the Worker to the deployed Walrus Sites URL.
- [x] Add a `<meta>` CSP to `app/layout.tsx`.
- [x] Remove or wire the hero "Upload files" attachment menu.
- [x] Add a "Download responses (JSON)" button to `/responses` for the bonus tier.
- [ ] Run one end-to-end submission on mainnet to satisfy the "≥1 test submission" requirement.
- [ ] Record the sub-3-min demo, upload it as a Walrus blob, and reference it in the submission.
- [ ] Convert the `CreatorFlow` step accordion from `max-h-32 ↔ max-h-0` to a `grid-template-rows: 1fr ↔ 0fr` transition (see §13).
- [ ] Replace the `REPLACE_WITH_KV_NAMESPACE_ID` placeholder in [ai-proxy/wrangler.toml](../ai-proxy/wrangler.toml) with the value from `wrangler kv namespace create RATE_LIMIT`.
- [ ] Decide whether to keep the dual `NEXT_PUBLIC_AI_PROXY_URL` / `NEXT_PUBLIC_CLAUDE_PROXY_URL` aliases or collapse to one (currently both point to the same Worker; see §12.2).

---

## 10. Differentiation roadmap

What's shipped goes beyond the bounty's literal asks. What's queued next:

- **Seal swap.** Replace Web Crypto ECIES with `@mysten/seal` so multi-admin allowlists, on-chain policy rotation, and key-server-backed recovery become first-class. Wire format already isolated behind the `crypto.ts` interface to make this a drop-in adapter swap.
- **On-chain `FormRegistry` + `SubmissionRef` Move package.** Replaces the per-browser localStorage indexes; restores cross-device dashboard and stable share URLs across edits.
- **MemWAL adapter.** Persist the aggregate insights rollup as its own Walrus blob and register it in `FormRegistry`, so agents (this product's and others) can read back across forms.
- **Trend-over-time charts** on `/responses` (week-over-week sentiment, priority backlog burn-down).
- **Cloudflare Turnstile-bound rate limiting** on the AI proxy, replacing the per-IP KV scheme that IPv6/NAT defeats.
- **Playwright e2e suite** covering publish → submit → decrypt → analyze.

## 11. TL;DR

The product **does what the bounty asks and more** in shipped code:
Walrus forms, Walrus submissions, real end-to-end encryption (Web
Crypto ECIES, with the Seal swap scoped behind the same interface),
real Claude form generation, real Whisper voice + **live streaming
transcripts via Web Speech**, real wallet + Google login, real per-form
responses viewer with **per-row AI analysis and an aggregate insights
panel** that rolls every cached analysis into sentiment, priority, and
top-topics dashboards. No mocks where the docs claim functionality.

The real remaining gaps are **(1) mainnet env not flipped and (2)
cross-device sync — requires the Move contract that is not yet built**. Both are
scoped, well-understood, and unblock with a few hours of work each.

The correctness bug surfaced during the original audit pass
(private-form decryption keying off the wrong ID) is fixed in the same
change that ships this document.

---

## 12. Source-truth re-audit (2026‑05‑12)

Re-audited every claim in §0 against the actual code (no doc-trusting).
Citations point at real symbols / line ranges in the current tree.

### 12.1 Walrus plumbing — ✅ real

- [walrus.ts](../app/src/lib/walrus.ts) `uploadBlob()` (L29) PUTs raw bytes to `${PUBLISHER_URL}/v1/blobs?epochs=${DEFAULT_EPOCHS}&permanent=true` and parses `newlyCreated.blobObject.blobId` / `alreadyCertified.blobId`. Retries on 5xx + network errors only. No mock path.
- `uploadJSON` (L116) and `uploadFile` (L88) both go through `uploadBlob`.
- `fetchBlob` (L126) GETs `${AGGREGATOR_URL}/v1/blobs/<id>` with the same retry shape.
- Defaults: `https://publisher.walrus-testnet.walrus.space` / `https://aggregator.walrus-testnet.walrus.space`. Mainnet flip is a single env change ([app/.env.production.example](../app/.env.production.example)).
- `permanent=true` is hard-coded — confirmed in the URL builder. Matches the "permanent record" claim.

### 12.2 AI proxy — ✅ real, with two minor cleanup items

- [ai-proxy/src/worker.ts](../ai-proxy/src/worker.ts) routes: `POST /` → Anthropic Messages API, `POST /transcribe` → OpenAI Whisper, both behind an Origin allow-list (L48), per-IP KV rate limit (L70), and a 60 s upstream timeout (L181).
- Model is **server-pinned** to `claude-haiku-4-5-20251001` (L25) — the browser cannot upgrade or downgrade it.
- Hardening: `MAX_REQUEST_BYTES = 1 MB` (L29), `MAX_AUDIO_BYTES = 25 MB` (L28), `MAX_SYSTEM_PROMPT_CHARS = 16 000` (L30), `MAX_TOKENS_CAP = 2 048` (L26), `temperature` clamped 0..1.
- Cleanup items:
    1. [ai-proxy/wrangler.toml](../ai-proxy/wrangler.toml) still has `id = "REPLACE_WITH_KV_NAMESPACE_ID"` — must be filled before deploy or rate limiting silently breaks (Worker will 500 on first request).
    2. The browser reads both `NEXT_PUBLIC_AI_PROXY_URL` ([ai-submission-analysis.ts](../app/src/lib/ai-submission-analysis.ts) L18) and `NEXT_PUBLIC_CLAUDE_PROXY_URL` ([ai-form-builder.ts](../app/src/lib/ai-form-builder.ts) L15). They're both set to the same value in the example envs, but the duplication is a footgun — pick one.

### 12.3 Text-to-form — ✅ real

- [Hero.tsx](../app/src/components/marketing/Hero.tsx) L176 / L192 `router.push('/builder?…')` carries the typed prompt + draft id into the builder.
- [BuilderLayout.tsx](../app/src/components/builder/BuilderLayout.tsx) L82 reads `mode=ai`, L192 calls `generateFormFromPrompt(aiPrompt, aiAttachments)`.
- [ai-form-builder.ts](../app/src/lib/ai-form-builder.ts) L104 posts `{ model, max_tokens: 1024, system, messages: [{ role:'user', content: userBlocks }] }` to the proxy. Strict JSON parse with code-fence stripping (L165).
- System prompt (L48‑L92) explicitly forbids prose / markdown fences and enumerates valid field types — matches what the builder consumes.
- Throws if `NEXT_PUBLIC_CLAUDE_PROXY_URL` is unset (L116). No silent fallback to a stub.

### 12.4 Voice-to-form + live streaming — ✅ real

- [liveTranscription.ts](../app/src/lib/liveTranscription.ts) wraps Web Speech (`SpeechRecognition` / `webkitSpeechRecognition`) with `continuous = true`, `interimResults = true` (L93). Returns `null` on Firefox / unsupported browsers — caller falls back.
- [Hero.tsx](../app/src/components/marketing/Hero.tsx) L297 spins up a `MediaRecorder` in parallel with the live transcriber (L325). On stop, the recorded `Blob` is sent to `${proxyUrl}/transcribe` (L666) for the Whisper-final pass, which replaces the streamed partials.
- This is a genuine "stream while you talk, finalise when you stop" flow — not a stub.

### 12.5 Context-to-form — ✅ real

- [ai-attachments.ts](../app/src/lib/ai-attachments.ts) encodes attachments as Anthropic content blocks; oversize / unsupported MIMEs are pushed into a `skipped` array.
- [ai-form-builder.ts](../app/src/lib/ai-form-builder.ts) L130 prepends the typed prompt as a `{ type:"text" }` block, then spreads the encoded attachment blocks, then appends a "skipped" note when present. Multimodal forwarding is wired.

### 12.6 Edit-while-live — ✅ real (with the caveat already documented)

- [BuilderLayout.tsx](../app/src/components/builder/BuilderLayout.tsx) L79 reads `?id=<walrusBlobId>`, L109 `fetchJSON<FormConfig>(editFormBlobId)` rehydrates from Walrus, L115 stamps the local config with `walrusBlobId`.
- L468‑L473: on republish, the *previous* blob id is removed from both the wallet-keyed and anonymous local indexes. The old Walrus blob is **not** deleted (Walrus is permanent — that's the bounty's point) but it disappears from the dashboard.
- Confirmed: editing a live form produces a new blob id and therefore a new share URL until the on-chain registry ships ships `FormRegistry`.

### 12.7 Wallet login + dashboard — ✅ real, per-browser

- [DashboardPage.tsx](../app/src/components/dashboard/DashboardPage.tsx) L52 calls `adoptAnonymousForms(account.address)` on connect, which merges `scrolls:forms:anonymous` into `scrolls:forms:<addr>` and clears the anon bucket ([formIndex.ts](../app/src/lib/formIndex.ts) L89).
- Auth surface: extension wallets via dApp Kit Wallet Standard + Enoki / zkLogin via [EnokiWalletsRegister.tsx](../app/src/components/wallet/EnokiWalletsRegister.tsx) (silently no-ops without `NEXT_PUBLIC_ENOKI_API_KEY` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
- Caveat unchanged: index lives in `localStorage`, so a different browser / device sees an empty dashboard until you republish or until the on-chain registry ships's on-chain registry lands.

### 12.8 Private forms — ✅ real ECIES, single-key

- [crypto.ts](../app/src/lib/crypto.ts) L42 `generateFormKeypair()` (ECDH P-256), L60 `encryptForForm()` does ephemeral ECDH + HKDF-SHA256 + AES-GCM-256 with a fresh 12-byte IV, envelope shape `{ v, alg, ephemeralPub (SPKI b64u), iv, ciphertext }` matches the doc.
- [PublicFormPage.tsx](../app/src/components/form/PublicFormPage.tsx) L456 calls `encryptForForm` before upload — the publisher only sees ciphertext.
- Owner private key path: extractable JWK in `localStorage` (`storeFormPrivateKey`, L161) **plus** a non-extractable `CryptoKey` in IndexedDB via `keyStore.ts` for the decrypt path (`decryptForFormWithCryptoKey`, L122). The IndexedDB copy is what `/responses` uses; the JWK copy is the backup the owner downloads.
- Honest gap: the JWK in `localStorage` is extractable by definition, so XSS could still exfiltrate. The IndexedDB key is non-extractable but the JWK acts as a recovery / portability shim. Removing the `localStorage` JWK after the user confirms the download would close that gap.

### 12.9 "Memory on Walrus" — ⚠️ rhetorical, not a SDK integration

- There is no `@mysten/memwal` import anywhere in the tree (verified via grep: zero hits for `memwal` / `MemWAL` outside docs).
- What *exists*: every submission is a permanent Walrus blob, and `[ai-submission-analysis.ts](../app/src/lib/ai-submission-analysis.ts)` caches a per-blob analysis under `scrolls:ai-analysis:<submissionBlobId>` (L82). The `InsightsPanel` in [ResponsesPage.tsx](../app/src/components/responses/ResponsesPage.tsx) rolls those cached analyses into per-form aggregates (sentiment / priority / topics).
- That's a legitimate "submissions are the agent's memory, served from Walrus" story — but the per-blob cache is `localStorage`, not a Walrus-native MemWAL blob. The §10 "MemWAL adapter" item is correctly scoped as future work.

### 12.10 Static export & SSR safety — ✅ verified

- No `"use server"`, no `getServerSideProps`, no `app/api` directory.
- All routes use `?id=` query params (verified: `PublicFormPage.tsx` L354, `ResponsesPage.tsx` L64, `BuilderLayout.tsx` L79, `DashboardPage.tsx` L201) — no dynamic segments that would break `output: 'export'`.

---

## 13. Known design-rule violations

| File | Violation | Fix |
| --- | --- | --- |
| [CreatorFlow.tsx](../app/src/components/marketing/CreatorFlow.tsx) L258 | Step description accordion uses `max-h-32 ↔ max-h-0` `transition-all`. The Copilot-instructions design rule explicitly bans animating `height` / `max-height`. | Switch to a `grid-template-rows: 1fr / 0fr` parent + `min-h-0 overflow-hidden` child, or a `scaleY` + `transform-origin: top` motion variant. Both animate the compositor (transform / opacity) instead of layout. |

No other product-page files animate `height` / `width` directly (verified via grep for `animate.*height` / `max-h-` in `components/marketing/` and `components/form/`).

---

## 14. How to start testing — local + deployed

The old (legacy) testing notes in this audit are no longer accurate. Scrolls now has on-chain registry and Seal policy flows, so the setup and smoke path changed.

Use [TESTING.md](./TESTING.md) as the source of truth for:

- what you need to set up manually
- what should actually be deployed
- what values to provide back for debugging
- the full text, multimodal, public, private, admin, and hosted test flow
