# Scrolls — Hardening Roadmap

> Source of truth for the post-audit work. Derived from
> [AUDIT.md](./AUDIT.md). Bounty deadline **2026‑05‑18 12:00 UTC**.
> Today: **2026‑05‑13**.
>
> **Operating principle:** *no fallbacks, no stubs, no "punted-to-later"*.
> Every item below either ships working on mainnet by submission, or it
> is explicitly deferred *with a reason*. If something is in scope, it
> ships fully wired — not behind a feature flag, not behind a "demo
> mode", not behind a heuristic guard.
>
> **No code in this document.** This is the plan; the diffs land in the
> codebase milestone by milestone.

## Current Status Snapshot (audited 2026‑05‑13)

- Scrolls is **not ready for bounty submission yet**. The bounty asks for a
      real Walrus-native product on mainnet; the app still defaults to testnet,
      has not been smoke-tested on mainnet, and still relies on browser-local
      indexes for form and submission discovery.
- Scrolls is **not ready for the broader production market yet**. The current
      product is a credible Walrus MVP, but the structural pieces that make it
      trustworthy across devices and teams are still missing: on-chain form /
      submission pointers, multi-admin access control, and real Seal integration.
- The reason owners cannot reliably see responses today is architectural, not
      cosmetic: submissions are appended into the submitter's local
      `scrolls:submissions:<formId>` store. There is no shared on-chain
      `SubmissionRef` yet, so responses submitted from other devices do not appear
      in the owner's dashboard or responses page.
- Docs are currently ahead of the code in places. The shipped app still uses
      browser-side ECIES (`crypto.ts`), not Seal; Enoki is currently disabled; and
      mainnet deployment is not the default path. Treat this roadmap and the code
      as the source of truth until the docs catch up.

## Audit-derived completion snapshot

- **M1:** partially complete. Honest AI behavior and live network display
      landed, but mainnet defaults, Enoki, strict production CSP, and production
      worker origins are still open.
- **M2:** partially complete. Notes, priority, exports, counts, and raw
      Walrus links exist, but the page is still browser-local and the mainnet
      decryption flow has not been proven.
- **M3:** partially complete. Attachment drafts and builder hydration are
      real, but uploaded audio/video are not yet encoded for Claude and the UI does
      not surface attachment-usage trace information.
- **M4:** not started. No Move package, no registry client, no pointer
      URLs, no event-sourced dashboard.
- **M5:** not started. No `@mysten/seal`, no policy objects, no
      `SessionKey` flow, no multi-admin decryption.
- **M6:** partially complete. Client-side analysis exists, but there is
      no dedicated `/analyze` worker route and the analysis output is not yet
      promoted into row-header triage chips.
- **M7:** not started. No production deploy, demo artifact set, one-pager,
      or submission bundle.

---

## 0. Standing rules for every milestone

1. **No silent fallbacks.** If a dependency (Claude proxy, Walrus
   publisher, Seal key servers, on-chain registry) is unreachable, the
   UI surfaces the failure. We do not paper over outages with
   keyword-matching heuristics or local mocks.
2. **No half-wired UI.** Every visible affordance does the thing it
   claims. If a feature isn't ready, the affordance doesn't ship.
3. **Mainnet only for submission.** Devnet/testnet stay configurable for
   local dev, but the production build points at Sui mainnet, the
   mainnet Walrus publisher/aggregator, and the mainnet Seal key
   servers.
4. **One end-to-end smoke run per milestone** before declaring a milestone
   done: connect wallet → create form → publish → submit (private +
   public) → view & decrypt → edit → resubmit. All on mainnet by
   M4 onward.
5. **Each milestone ends with a green `pnpm build` and a manual checklist
   tick in this file.**

---

## M1 — Mainnet readiness & honest UI (Day 1, ~half a day)

**Goal:** every claim the UI makes is true, and every default points at
mainnet. After this milestone the product is *less capable* than today
because the broken affordances are removed — that's the point.

- [ ] **1.1** Flip default network to **Sui mainnet** in
      `app/src/lib/dapp-kit.ts`. Default Walrus publisher to
      `publisher.walrus.space`, aggregator to `aggregator.walrus.space`.
      Current code still defaults to testnet.
- [ ] **1.2** Update `app/.env.example` with the exact mainnet env vars
      reviewers need to set (`NEXT_PUBLIC_SUI_NETWORK`,
      `NEXT_PUBLIC_WALRUS_PUBLISHER_URL`,
      `NEXT_PUBLIC_WALRUS_AGGREGATOR_URL`, `NEXT_PUBLIC_CLAUDE_PROXY_URL`,
      `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
      Current `.env.example` remains testnet-first.
- [x] **1.3** Replace the hardcoded "Testnet" stat in
      `DashboardPage.tsx` with the live network from `useScrollsNetwork`.
- [x] **1.4** Remove the **AI heuristic fallback** from
      `ai-form-builder.ts`. If the proxy is missing or the call fails,
      the builder shows a real error state — not a fake form.
- [ ] **1.5** Remove the silent no-op in
      `EnokiWalletsRegister.tsx`. If Enoki env vars are missing in a
      production build, the build fails. (Local dev still tolerates
      missing vars via `NODE_ENV` check.) Enoki is currently hard-disabled,
      not production-gated.
- [x] **1.6** Wire the Hero "Add context" file menu through to the
      builder draft flow so the UI stops promising what it can't deliver.
- [x] **1.7** Update marketing copy in `Hero.tsx` and `SPEC.md` so
      "live audio streaming" is never claimed. Voice input is described
      as *"voice → transcript via Whisper"*.
- [ ] **1.8** Add a strict CSP `<meta>` tag to `app/layout.tsx`:
      `script-src 'self'`, `connect-src` allowlist (Walrus publisher,
      aggregator, Claude proxy, Sui mainnet RPC, Enoki, Google
      OAuth), `img-src` aggregator only, `object-src 'none'`,
      `base-uri 'self'`, `frame-ancestors 'none'`. A CSP meta exists, but it
      still allows `unsafe-inline`, dev/testnet origins, and third-party icon
      endpoints.
- [ ] **1.9** Worker: tighten `ALLOWED_ORIGINS` to the deployed
      Walrus Sites URL plus localhost dev origins, no wildcards.
      `wrangler.toml` still only lists localhost origins.
- [ ] **1.10** Rewrite `README.md` and any public-facing docs that still claim
      Seal, live mainnet deployment, or active Enoki support before those are
      actually shipped.

**Exit criteria:** mainnet build deployable to Walrus Sites, no
half-wired affordances, no claims the product can't back up.

---

## M2 — Real submission decryption fix + admin completeness (Day 1‑2, ~1 day)

**Goal:** the responses page is a real admin tool, and the
private-form path is verifiably correct end-to-end.

- [ ] **2.1** Land a manual test plan for private forms (create
      private → submit two responses → close tab → reopen
      `/responses?id=…` → decrypt) and check it off after running on
      mainnet. The decryption-key bug fix is already in tree; this
      milestone verifies it under real network conditions.
- [x] **2.2** Add **per-row admin notes** to `ResponsesPage.tsx`,
      stored in `localStorage` keyed by submission blob ID. Note that
      these are intentionally local-only (admin-only metadata, never
      uploaded to Walrus).
- [ ] **2.3** Add **per-row priority** (low / medium / high / critical)
      with the same local-only storage and a colored chip in the row
      header. Priority editing exists, but it is not yet surfaced as a
      row-header chip.
- [ ] **2.4** Add **sort + filter** controls: by date, by priority, by
      "decrypted vs locked". Sort/date/priority are in place; the specific
      decrypted-vs-locked filter is still missing.
- [x] **2.5** Add **export buttons**: "Download all (JSON)" and
      "Download all (CSV)". CSV flattens responses against the form's
      field labels. For private forms the export is the *decrypted*
      content; rows that failed to decrypt are excluded from CSV and
      annotated in JSON.
- [ ] **2.6** Add a **"copy submission link"** affordance per row that
      opens the raw submission blob on the Walrus aggregator (proof of
      permanence). The row already links to the raw Walrus blob, but there is
      no dedicated copy-URL affordance yet.
- [x] **2.7** Show submission counts on the dashboard's `FormCard`
      that match the responses page (one source of truth).

**Exit criteria:** an admin can triage a real bug-report form on
mainnet — decrypt, prioritise, annotate, export — without leaving the
app.

---

## M3 — Multimodal AI: attachments → Claude (Day 2, ~half a day)

**Goal:** the Hero's "Add screenshots, docs, audio, or video" promise
is real. Claude Haiku 4.5 is multimodal; we use that, no shims.

- [x] **3.1** Hero: persist captured `File[]` to a draft scoped to a
      generated `draftId` (IndexedDB, not query string).
- [x] **3.2** `/builder?draft=<draftId>` reads the draft, hydrates the
      prompt and the attachment list.
- [ ] **3.3** Builder calls the Claude proxy with a real multimodal
      `messages[].content[]` payload: text part for the brief, `image`
      parts for screenshots, `document` parts for PDFs, transcribed
      text for audio (Whisper round-trip happens before the Claude
      call). No proxy logic changes — the proxy already passes the
      body through. Images / PDFs / text are wired; uploaded audio and video
      files are still skipped.
- [x] **3.4** Per-attachment size limits enforced **before** upload to
      Claude (Anthropic's image cap). Oversize → real error in the
      builder, not a silent drop.
- [ ] **3.5** Show "Used N attachments as context" in the builder's AI
      status pill. If the AI didn't use them (Claude's tool-use trace),
      surface that.
- [x] **3.6** Voice attachments: when the Hero has both prompt text
      and a recorded audio note, both get included as Claude context;
      the audio is Whisper-transcribed first, the text is appended,
      and the original audio bytes are *not* sent (Claude doesn't
      accept audio input today).

**Exit criteria:** uploading a screenshot of a real bug ticket
generates a form whose fields reflect the screenshot's content. No
heuristic fallback — if Claude is unreachable, the user sees a clear
error.

---

## M4 — Move contract: `FormRegistry` + `SubmissionRef` + `FormPointer` (Day 3‑4, ~1.5 days)

**Goal:** kill `localStorage` as the source of truth. Forms and
submissions are owned by Sui objects; share URLs survive edits;
dashboards work cross-device. **This is the structural fix the audit
flagged as M2 — we are doing it now.**

**Current status:** none of this exists yet. There is no `move/` package,
no `lib/registry.ts`, no `contracts.ts`, and publish / submit still mint
`/f?id=<blobId>` links backed by local `formIndex.ts` and
`submissionIndex.ts`.

### 4.1 Move package design

- **`FormPointer`** (shared object owned by the creator):
  - `id: UID`
  - `owner: address`
  - `current_blob_id: vector<u8>` (Walrus blob ID of the latest
    `FormConfig` JSON)
  - `version: u64`
  - `created_at_ms: u64`
  - `updated_at_ms: u64`
  - Events: `FormPublished`, `FormUpdated`.
- **`SubmissionRef`** (owned by the submitter, frozen):
  - `id: UID`
  - `form_pointer_id: ID` (link back to the `FormPointer`)
  - `blob_id: vector<u8>` (Walrus blob ID of the submission JSON)
  - `submitter: address`
  - `submitted_at_ms: u64`
  - Event: `SubmissionRecorded { form_pointer_id, blob_id, submitter }`.
- **`FormRegistry`** is *implicit* via events. We do not maintain a
  global mutable registry object — that's a contention bottleneck.
  Indexers (and our own client) consume the `FormPublished` /
  `FormUpdated` / `SubmissionRecorded` events. Per-creator dashboard
  listing uses Sui's `queryEvents` + `queryTransactionBlocks` filtered
  by sender.
- **Access control:** only `owner` can `update_form`. `submit` is
  permissionless (anyone with a wallet, including Enoki / zkLogin,
  can call it). Anonymous submissions remain off-chain (Walrus blob
  only, no `SubmissionRef`) — the form's `settings.allowAnonymous`
  decides which path the public form uses.

### 4.2 Implementation tasks

- [ ] **4.2.1** Scaffold `move/scrolls/` with `Move.toml`, `sources/`,
      and a test module.
- [ ] **4.2.2** Implement `form_pointer.move`: `create`, `update`,
      `view` (read-only), with the events above.
- [ ] **4.2.3** Implement `submission_ref.move`: `record`, with the
      event.
- [ ] **4.2.4** Move tests for happy path, unauthorised update,
      cross-form submission ref.
- [ ] **4.2.5** Publish the package to **Sui devnet** for integration,
      then to **mainnet** before submission. Record the package ID in
      `app/src/lib/contracts.ts` (a tiny constants module).

### 4.3 Client integration

- [ ] **4.3.1** New `lib/registry.ts` wrapping the Move calls using
      `@mysten/sui` programmable transactions. Functions:
      `publishForm(blobId)`, `updateForm(pointerId, blobId)`,
      `recordSubmission(pointerId, blobId)`, `getMyForms(address)`,
      `getFormPointer(pointerId)`, `getSubmissionsForForm(pointerId)`.
- [ ] **4.3.2** Replace `formIndex.ts` and `submissionIndex.ts` reads
      with registry queries. The local indexes are removed entirely
      (no dual-writes, no migration paths — clean cut, this is the
      "no fallbacks" rule).
- [ ] **4.3.3** Public form URL becomes `/f?pointer=<objectId>` and
      resolves the current blob on every load. Old `?id=<blobId>` URLs
      still work for the first wave of test submissions but are no
      longer minted by the publish flow.
- [ ] **4.3.4** Dashboard `getMyForms` is event-sourced; submissions
      count is event-sourced.
- [ ] **4.3.5** Builder grows `/builder?pointer=<objectId>` to load,
      edit, and *update* an existing form (uploads new blob, calls
      `update_form` with the new blob ID).
- [ ] **4.3.6** Submission flow: after Walrus upload, public form
      calls `record_submission` if a wallet is connected. Anonymous
      submissions skip the on-chain record (Walrus blob is still
      durable evidence).

**Exit criteria:**

- Creating a form on phone shows up on desktop after wallet connect.
- Editing a form keeps the share link valid.
- Responses page enumerates submissions from chain events, not
  `localStorage`.
- Move package live on mainnet with verified source on Sui Explorer.

---

## M5 — Real Seal integration for private forms (Day 5, ~1 day)

**Goal:** retire the Web Crypto ECIES envelope. Private forms use
`@mysten/seal` end-to-end with on-chain access policy, mainnet key
servers, and SessionKey-based decryption.

**Current status:** none of this exists yet. The repo still uses
browser-generated ECDH + AES-GCM key material from `crypto.ts`, stores a
downloadable key backup, has no `@mysten/seal` dependency, and has no admin
policy object or `SessionKey` decryption flow.

### 5.1 Move side

- [ ] **5.1.1** Add `seal_policy.move` defining a `FormPolicy` shared
      object owned by the form creator: a `vector<address>` of admins
      who may decrypt.
- [ ] **5.1.2** Add `seal_approve_decrypt` entry function whose
      signature matches Seal's expectation. It checks
      `tx_context::sender() == owner || vector::contains(admins, sender)`.
- [ ] **5.1.3** Tests for: owner decrypts, admin decrypts, stranger
      rejected, removed admin rejected after policy update.
- [ ] **5.1.4** Add `add_admin` / `remove_admin` entries with
      owner-only auth.
- [ ] **5.1.5** Publish the upgraded package to mainnet and record the
      new package ID.

### 5.2 Client side

- [ ] **5.2.1** New `lib/seal.ts` adapter exposing the same surface
      as `crypto.ts` (`encryptForForm`, `decryptForForm`,
      `isEncryptedEnvelope`) so call sites don't change.
      Implementation uses `@mysten/seal` with two **independent
      mainnet key servers** (IDs from the official docs), `t=2`
      threshold, decentralized mode.
- [ ] **5.2.2** Form creation flow: instead of generating an ECDH
      keypair, the creator's `FormPolicy` object ID is what gets
      stored on the `FormConfig`. Encryption uses
      `client.encrypt({ threshold, packageId, id: <policy-object-id>, data })`.
- [ ] **5.2.3** Decryption flow: requires a `SessionKey` signed by the
      admin's wallet (extension or Enoki). The responses page
      transparently prompts for one signature per session.
- [ ] **5.2.4** Admin management UI on `/responses?id=…&tab=admins`:
      add/remove admin addresses; calls the Move `add_admin` /
      `remove_admin` entries.
- [ ] **5.2.5** Migration: existing v1-envelope private forms continue
      to decrypt with `crypto.ts`. New private forms always use Seal.
      The detection is by envelope shape (`isEncryptedEnvelope` for
      v1, Seal blob for v2) — this is a *protocol detection*, not a
      capability fallback.
- [ ] **5.2.6** Remove the "download key backup" flow for Seal forms
      — there is no client-side secret to back up. The legacy backup
      flow stays only for v1 envelope forms.

**Exit criteria:**

- A private form created on mainnet can be decrypted by the creator
  on a different device with no key file, only their wallet
  signature.
- A second admin can be added by the creator and decrypts
  successfully.
- A removed admin's `SessionKey` stops working on the next session.

---

## M6 — Submission analysis pipeline (Day 6, ~half a day)

**Goal:** the bonus tier "AI-suggested priority / sentiment / topics"
is real, not just a typed interface.

**Current status:** partially shipped. The client can already analyze decrypted
submissions and cache results locally, but it still posts to the generic Claude
proxy route and does not yet drive row-header chips from those results.

- [ ] **6.1** New Worker route `/analyze` that takes a flattened
      submission and returns the `AIAnalysis` shape. Same hardening as
      `/v1/messages` (origin allowlist, rate limit, model pin, max
      tokens, temperature clamp).
- [x] **6.2** `/responses?id=…` triggers analysis on demand per row
      (button) and on first decrypt. Result cached in `localStorage`
      keyed by submission blob ID — analysis is admin-only metadata.
- [ ] **6.3** Suggested priority drives the row's chip color unless
      the admin overrode it manually in M2.
- [ ] **6.4** Sentiment + top topic surfaced as small chips in the row
      header.

**Exit criteria:** opening a real feedback form's responses produces
useful priority + topic chips for at least 5 sample submissions.

---

## M7 — Submission deliverables (Day 7)

**Goal:** the bounty actually gets submitted.

- [ ] **7.1** Deploy the latest static build to Walrus Sites at the
      production URL. Update `ALLOWED_ORIGINS` on the Worker.
- [ ] **7.2** Create the canonical demo form (bug report) on mainnet.
      Submit ≥1 real response (private + public).
- [ ] **7.3** Record the **sub-3-minute demo video**. Cover: prompt →
      generate → publish → share → submit → decrypt on a different
      browser → edit & republish → admin add. Upload the video to
      Walrus, capture the blob URL.
- [ ] **7.4** Write the **one-pager** (separate `docs/ONE-PAGER.md`):
      problem, solution, what's on-chain vs Walrus, Seal usage, demo
      link, contracts, repo URL.
- [ ] **7.5** README polish: quickstart, env vars, Move package
      address, key server IDs, Worker deployment, screenshot.
- [ ] **7.6** Final security pass: re-run the audit checklist; confirm
      every "❌" / "⚠️" in [AUDIT.md](./AUDIT.md) is now "✅" or
      explicitly justified as out-of-scope (the only acceptable
      remaining ones: live streaming ASR, MemWAL, e2e Playwright
      tests).
- [ ] **7.7** Submit.

---

## Out-of-scope (and why)

These are *not* punted to "M2 later" — they are out of scope for
this product, full stop, with reasons:

- **Live streaming ASR.** Whisper has no real-time API. Switching to
  OpenAI Realtime / Deepgram would require a streaming proxy and a
  WebRTC client. The bounty doesn't ask for it; record-and-transcribe
  covers the use case (capturing a verbal brief for the form
  generator). If we ever build a "live interview → form" mode, that's
  a separate project.
- **MemWAL agent memory.** The agent surface is single-shot prompt →
  form. Persistent memory across sessions adds no user value here.
- **Playwright e2e suite.** Useful, but not bounty-critical. Manual
  smoke runs at the end of every milestone plus the cross-device
  decryption test in M5 cover the highest-risk paths.
- **Wallet-signed submissions (`SubmissionRef` is signed for free**
  because the Move call is signed by the submitter's wallet, but we
  do **not** add a separate "attestation" signature layer over the
  submission blob's content). Form-as-feedback semantics don't need
  it.
- **Self-hosted Walrus aggregator.** Public mainnet aggregator is
  fine for the bounty.

---

## Risk register

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Mainnet Walrus publisher rate-limits or rejects our blobs | Medium | High | Test early in M1; fall back to a self-funded publisher only if needed (this is operational, not a code fallback). |
| Seal mainnet key servers unavailable during demo | Low | High | Use the two officially recommended independent key servers; record the demo against a known-good window. |
| Move package upgrade required after M5 (admin management) | Medium | Medium | Use Sui's `UpgradeCap`; design `seal_approve_decrypt` to be backward-compatible from day one. |
| Claude Haiku multimodal cost spike during demo | Low | Medium | `max_tokens` cap + per-attachment size cap + per-IP rate limit already in place. |
| Enoki Google login fails on mainnet for non-crypto reviewers | Medium | High | Test the Enoki flow end-to-end on M1 mainnet build, not just locally. |
| Last-day deploy slippage | High | Critical | M7 starts no later than 2026‑05‑17 morning UTC; demo video recorded the day before submission, not the day of. |

---

## Milestone tracker

| Milestone | Owner | Started | Finished | Smoke-tested on mainnet |
| --- | --- | --- | --- | --- |
| 1. Mainnet readiness & honest UI | — | — | — | — |
| 2. Decryption verify + admin completeness | — | — | — | — |
| 3. Multimodal AI attachments | — | — | — | — |
| 4. Move contract: `FormPointer` + `SubmissionRef` | — | — | — | — |
| 5. Real Seal for private forms | — | — | — | — |
| 6. Submission analysis pipeline | — | — | — | — |
| 7. Submission deliverables | — | — | — | — |

We update this tracker at the end of each milestone. Anything not green by
2026‑05‑17 EOD UTC gets cut from the submission rather than shipping
half-wired.
