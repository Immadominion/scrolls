# Scrolls — Engineering Plan

**Deadline**: May 18, 2026, 12:00 UTC
**SDLC approach**: Structured — design before code, test before ship, document as you go

---

## Status (Nov 2025) — Today

The product is live end-to-end on Walrus testnet with **no Move contract** and **no backend server**:

- ✅ Form builder (`/builder`) with 10 field types, AI-assisted generation (Claude Haiku via Cloudflare Worker proxy), voice → form (Whisper).
- ✅ Publish flow uploads `FormConfig` JSON to Walrus → blob ID becomes the form ID.
- ✅ Public form renderer (`/f?id=<blobId>`) fetches config from Walrus, submits responses back to Walrus, surfaces a copyable Walrus receipt on the thank-you screen.
- ✅ Dashboard (`/dashboard`) lists the connected wallet's forms with response counts (per-browser localStorage index).
- ✅ Per-form responses viewer (`/responses?id=<blobId>`) lazy-loads each submission JSON from Walrus and renders against the original field labels.
- ✅ **End-to-end encryption shipped** (`lib/crypto.ts`): private forms generate an ECDH P-256 keypair at publish time; submissions are encrypted client-side via an ECIES envelope (HKDF-SHA256 → AES-GCM-256). Owner downloads a key backup; responses viewer decrypts in-browser or prompts to import the backup.
- ✅ Wallet stack: `@mysten/dapp-kit-react` 2.x for extension wallets + `@mysten/enoki` 1.x for Sign-in-with-Google (zkLogin). Both register via the Sui Wallet Standard.
- ✅ Static export builds as 6 prerendered routes (`/`, `/builder`, `/dashboard`, `/f`, `/responses`, `/_not-found`).
- ✅ AI proxy (`ai-proxy/`) deployed on Cloudflare Workers with KV-based rate limiting.

Coming next:

- ⏳ Move contract `FormRegistry` + `SubmissionRef` for cross-device sync (replaces localStorage indexes).
- ⏳ **Seal upgrade** for private forms: deploy a Move package with `seal_approve*` so multiple admins can decrypt without sharing the raw key, and so a lost backup file is no longer fatal.
- ⏳ Enoki **sponsored transactions** so respondents never need SUI to submit.
- ⏳ AI analysis dashboard panel (sentiment, topic clusters, suggested priority) — proxy already supports the call.

---

## Architecture Snapshot

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Next.js static export, served from Walrus Sites)      │
│                                                                 │
│  ┌─ Wallets ──────────────────────────────────────────────────┐ │
│  │  @mysten/dapp-kit-react  ─┐                                │ │
│  │  @mysten/enoki (Google)  ─┼─►  Sui Wallet Standard         │ │
│  └───────────────────────────┘                                │ │
│                                                                 │
│  ┌─ Storage layer (lib/) ────────────────────────────────────┐ │
│  │  walrus.ts          uploadJSON / fetchJSON                 │ │
│  │  formIndex.ts       per-wallet localStorage form list      │ │
│  │  submissionIndex.ts per-form localStorage response list    │ │
│  │  sui.ts             address utils only (no on-chain calls) │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────┬─────────────────────────────────┬──────────────────┘
             │                                 │
             ▼                                 ▼
   ┌──────────────────────┐         ┌──────────────────────────┐
   │ Walrus testnet       │         │ Cloudflare Worker        │
   │ publisher/aggregator │         │  ai-proxy/               │
   │ (HTTP REST API)      │         │  → Anthropic Claude Haiku│
   │  forms + responses   │         │  → OpenAI Whisper        │
   └──────────────────────┘         └──────────────────────────┘
```

`Form ID === Walrus blob ID`. There is no separate identifier and no Move contract today.

---

## Guiding Principles

1. **Shape before code** — no component gets built without a brief from `/impeccable shape` or `/impeccable craft`
2. **Vertical slices** — each milestone ships something usable, not half-built layers
3. **Walrus-first data model** — every storage decision starts from "how does this live on Walrus"
4. **Impeccable discipline** — every UI pass goes through the animate → polish → harden sequence before it's done
5. **The demo proves the product** — the submission video is created using Scrolls itself (recursive proof-of-concept)

---

## Current Direction Update (Nov 2025)

- `app/` is the canonical web app and serves both marketing and product routes from one static export
- `scrolls/scrolls-landing/` is a legacy marketing prototype/reference, not the long-term deployment target
- Creators/admins authenticate with a Sui wallet **or Sign-in-with-Google via Enoki**; respondents remain anonymous unless a form disables it
- Seal remains the privacy layer for private submissions (planned)
- AI surface is prompt-to-form generation + voice→form using Claude Haiku 4.5 + Whisper-1, both via the Cloudflare Worker proxy
- Walrus storage writes are paid by the connected wallet today; sponsored Walrus + Sui writes via Enoki land in Step 2

---

## Step 0 — Foundation & Design System (Day 1–2)

### Goal

Scaffold the project, lock in the brand, generate `DESIGN.md`, and set up the development environment. No feature code yet.

### Tasks

#### 0.1 Project Scaffold

- [ ] Initialize Next.js 14 app with `output: 'export'`, TypeScript, Tailwind CSS, App Router
- [ ] Configure path aliases, ESLint, Prettier
- [ ] Install core dependencies: `@mysten/dapp-kit`, `@mysten/sui`, `@mysten/walrus`, `framer-motion`, `shadcn/ui`, `dnd-kit`, `tiptap`, `recharts`, `groq-sdk`
- [ ] Create `.env.example` with all required environment variable keys
- [ ] Set up `site-builder.yaml` for Walrus Sites deployment config
- [ ] Initialize Sui Move project in `contracts/scrolls/`

#### 0.2 Brand Design

Run the `brand-design` skill to generate the color palette, typography, and `brand.md`.

**Target aesthetic**: Quiet authority. The interface of a tool that takes your data seriously. Think Linear + Notion, not Typeform. Ocean-blue accent, cool-tinted surfaces, generous whitespace.

**Anti-references**: Anything that looks like a generic "web3 dashboard" (green glows, dark purple gradients, neon). No decorative gradients on body copy.

**Typography target**:

- Headlines: Geist or Inter Display (tight tracking at large sizes)
- Body: Inter (clean, safe, readable)
- Code/IDs: Geist Mono

#### 0.3 DESIGN.md Seed

Run `/impeccable document --seed` to generate the initial `DESIGN.md`:

- Creative North Star: **"The Reliable Cartographer"** — Everything has its place. Typography is the hierarchy. Color earns its role. Motion says what words don't need to.
- Color strategy: Cool-tinted light/dark surfaces, one committed ocean-blue accent
- Motion energy: Purposeful, unhurried. 200–300ms. Ease-out-quart.
- References: Linear, Vercel Dashboard, Notion
- Anti-references: Rainbow dashboards, crypto "hacker" dark UIs, bouncing animations

#### 0.4 PRODUCT.md

Run `/impeccable teach` to generate `PRODUCT.md`:

- **Product**: Scrolls — Walrus-native form and feedback platform
- **Audience**: Protocol teams on Sui/Walrus, DAO operators, hackathon builders
- **Tone**: Confident, direct, no marketing fluff. Docs-quality prose.
- **Anti-patterns**: "Decentralize everything" evangelism. Crypto jargon in UI copy.

### Deliverables

- Running `pnpm dev` environment
- `brand.md` at root
- `DESIGN.md` at root
- `PRODUCT.md` at root
- Sui Move contract skeleton

---

## Step 1 — Form Builder UI (Day 2–4)

### Goal

A fully functional form builder that produces valid `FormConfig` JSON. No Walrus storage yet — just the UI working perfectly.

### Impeccable Workflow

Run `/impeccable craft "form builder with drag-and-drop field editor"` for this entire milestone.

Discovery questions to pre-answer in the brief:

- **Who uses it**: A founder or team lead building a feedback flow. Desktop, focused work context.
- **Content**: Variable number of fields (1–20 typical). Drag-reorder. Inline config.
- **Most important thing**: The form builder must feel like a professional tool, not a toy.
- **Feeling**: Quiet control. Every field configuration is inline — no modals that break flow.
- **Constraints**: Static export — no server. All state client-side (Zustand store).

### Tasks

#### 1.1 Form Builder Shell

- [ ] `/app/builder/page.tsx` — builder layout (sidebar + canvas + settings panel)
- [ ] Zustand store: `useFormStore` — holds all `FormConfig` state
- [ ] Field palette sidebar (all 10 field types with icons, click-to-add)
- [ ] Canvas — ordered list of active fields
- [ ] Settings panel — form title, description, settings

#### 1.2 Drag & Drop

- [ ] Integrate `dnd-kit` for field reordering on the canvas
- [ ] Drag ghost follows cursor smoothly (framer-motion `layoutId`)
- [ ] Drop zones highlight on hover

#### 1.3 Field Editors (inline, per field type)

- [ ] `short_text` — label, placeholder, help text, required toggle
- [ ] `long_text` — same as short_text
- [ ] `rich_text` — same + Tiptap preview
- [ ] `dropdown` — option list editor (add/remove/reorder options)
- [ ] `multi_select` — option list editor
- [ ] `star_rating` — label + required toggle (no extra config)
- [ ] `file_upload` — accepted types selector, max file size slider
- [ ] `video_upload` — max file size slider
- [ ] `url` — label, placeholder, required toggle
- [ ] `confirm_checkbox` — label (the checkbox text itself)

#### 1.4 Form Preview Mode

- [ ] Toggle between "Edit" and "Preview" tabs
- [ ] Preview renders the exact `FormConfig` as it would appear to a respondent
- [ ] All field interactions work in preview (for testing)

#### 1.5 Form Settings Panel

- [ ] Privacy toggle (private/public) with Seal explanation tooltip
- [ ] Allow anonymous toggle
- [ ] Close date picker
- [ ] Max submissions input
- [ ] Success message textarea

### Micro-Animations (at end of 1.5)

Run `/impeccable animate` on the builder:

- New field added: `grid-template-rows` expansion (not height), 220ms
- Field reorder: `layoutId` spring via framer-motion
- Required toggle: scale + color transition on the badge, 160ms
- Field hover: subtle elevation (box-shadow lift), 140ms
- Edit/Preview tab switch: cross-fade content, 200ms

### Deliverables

- Working form builder at `/builder`
- All 10 field types configurable
- Preview mode accurate
- Animations on all interactive moments

---

##  Coming-next: — Walrus Storage Integration (Day 4–5)

### Goal

Wire the form builder to Walrus and Sui. Publishing a form stores config on Walrus and registers it on-chain.

### Tasks

#### 2.1 Walrus Client (`lib/walrus.ts`)

- [ ] `uploadBlob(data: Uint8Array): Promise<string>` — uploads to Walrus, returns blob ID
- [ ] `fetchBlob(blobId: string): Promise<Uint8Array>` — fetches from Walrus aggregator
- [ ] `uploadJson(obj: object): Promise<string>` — JSON serialization wrapper
- [ ] `fetchJson<T>(blobId: string): Promise<T>` — JSON deserialization wrapper
- [ ] Walrus aggregator URL from env var (`NEXT_PUBLIC_WALRUS_AGGREGATOR`)
- [ ] Walrus publisher URL from env var (`NEXT_PUBLIC_WALRUS_PUBLISHER`)

#### 2.2 Sui Client (`lib/sui.ts`)

- [ ] Contract call: `createForm(configBlobId, isPrivate, sealPolicyId)` → creates FormEntry
- [ ] Contract call: `recordSubmission(formId, submissionBlobId, isEncrypted)` → creates SubmissionRef
- [ ] Query: `getFormsByOwner(address)` → returns FormEntry[]
- [ ] Query: `getSubmissionsForForm(formId)` → returns SubmissionRef[]

#### 2.3 Sui Move Contract (`contracts/scrolls/`)

- [ ] `FormRegistry` shared object — one per deployer
- [ ] `create_form` entry function
- [ ] `record_submission` entry function
- [ ] `add_admin` entry function (for Seal policy management)
- [ ] Deploy to Sui devnet, then testnet, then mainnet

#### 2.4 Form Publishing Flow

- [ ] "Publish" button in builder → triggers wallet tx signing
- [ ] Upload `FormConfig` JSON to Walrus → get blob ID
- [ ] If private: create Seal policy object → get policy ID
- [ ] Call `create_form` on Sui → tx confirmed
- [ ] Navigate to share page with form link

#### 2.5 Public Form Renderer (`/app/f/` — query-param route `/f?id=<formId>`, required for static export)

- [ ] Fetch `FormConfig` blob from Walrus on page load
- [ ] Render all field types from config
- [ ] File upload: `<input type="file">` → upload directly to Walrus → store blob ID
- [ ] Video upload: same as file upload
- [ ] Submit: assemble `Submission` JSON → upload to Walrus → call `record_submission` on Sui
- [ ] Success screen with custom message and copy-link CTA

#### 2.6 Loading States

All Walrus fetches are async and potentially slow. Every data-dependent view needs:

- [ ] Skeleton screen while form config loads (matching form layout)
- [ ] Progress indicator on file uploads (bytes uploaded / total)
- [ ] "Submitting..." state on submit button (spinner inside button, not separate)
- [ ] Error state if Walrus fetch fails (retry button)

### Deliverables

- End-to-end form creation → submission working on devnet
- Submission stored on Walrus, indexed on Sui

---

## Step 3 — Admin Dashboard (Day 5–7)

### Goal

A full-featured admin dashboard where form owners can manage submissions.

### Impeccable Workflow

Run `/impeccable craft "admin dashboard for reviewing and prioritizing form submissions"` for the dashboard.

Brief pre-answers:

- **Who**: Same person who created the form. Desktop, focused context.
- **Content**: Up to hundreds of submissions. Mix of field types. Some have file attachments.
- **Most important**: Fast triage. Get from "new submission" to "understood and acted on" without friction.
- **Feeling**: Dense but not overwhelming. Linear-esque. Information hierarchy is king.
- **Constraints**: All data loaded from Walrus (async). Encrypted submissions need wallet action to decrypt.

### Tasks

#### 3.1 Dashboard Shell (`/app/dashboard/`)

- [ ] Wallet-gated (redirect to connect if not connected)
- [ ] Sidebar: list of user's forms with submission counts
- [ ] Main area: submission table for selected form

#### 3.2 Submission Table

- [ ] Columns: date, submitter (truncated address or "Anonymous"), star preview, priority badge, status
- [ ] Sort by all columns
- [ ] Filter sidebar: date range, priority, status, keyword search
- [ ] Pagination or virtual scroll for large sets
- [ ] Row click → opens detail panel (slide-in from right, no page nav)

#### 3.3 Submission Detail Panel

- [ ] Full rendering of all field responses
- [ ] File/image previews loaded from Walrus blob IDs
- [ ] Encrypted indicator for private submissions (lock icon, "Decrypt" button)
- [ ] Notes editor (textarea, auto-save to localStorage per submission ID)
- [ ] Priority selector (4 states with keyboard shortcuts)
- [ ] Status selector

#### 3.4 Bulk Operations

- [ ] Checkbox multi-select on table rows
- [ ] Bulk toolbar: "Set Priority", "Set Status", "Export Selected", "Archive"

#### 3.5 Export

- [ ] "Export CSV" → PapaParse serialization → download
- [ ] "Export JSON" → pretty-printed JSON download
- [ ] Both respect current filter state

### Micro-Animations (at end of 3.5)

Run `/impeccable animate` on the dashboard:

- Submission list initial load: staggered row entrance (20ms delay per row), opacity + translateX(-4px)
- Detail panel: slide in from right, 260ms, ease-out-quart
- Priority badge change: color transition + scale pop, 160ms
- Filter apply: table rows cross-fade (not pop), 200ms
- Export button: loading → done → back to idle state transition

### Deliverables

- Working dashboard at `/dashboard`
- Submission list, detail panel, notes, priority, export all functional

---

## Step 4 — Seal Encryption (Day 7–8)

### Goal

Private forms encrypt submissions with Seal. Dashboard decrypts on demand.

### Tasks

#### 4.1 Seal Client (`lib/seal.ts`)

- [ ] `createPolicy(ownerAddress): Promise<SealPolicyId>` — creates Seal access policy
- [ ] `addAuthorized(policyId, address)` — adds an admin to the policy
- [ ] `encrypt(policyId, data: Uint8Array): Promise<Uint8Array>` — encrypts with policy key
- [ ] `decrypt(policyId, ciphertext: Uint8Array): Promise<Uint8Array>` — prompts wallet, decrypts
- [ ] All Seal SDK operations with error handling

#### 4.2 Private Form Creation

- [ ] On publish: if `is_private`, call `createPolicy` → store policy ID with form
- [ ] Policy ID saved in FormEntry on Sui

#### 4.3 Private Submission

- [ ] On submit to private form: serialize response JSON → encrypt with Seal → upload ciphertext to Walrus
- [ ] SubmissionRef records `is_encrypted: true` + `seal_policy_id`

#### 4.4 Dashboard Decryption

- [ ] Encrypted submissions show lock icon in table and detail view
- [ ] "Decrypt" button → calls `seal.decrypt()` → wallet prompts user to sign → plaintext rendered
- [ ] Decrypted result cached in memory for the session (not persisted)

#### 4.5 Admin Management

- [ ] "Add Admin" button on form settings page
- [ ] Input wallet address → calls `addAuthorized` on Seal policy

### Deliverables

- Private forms encrypt before Walrus upload
- Dashboard decrypts on demand via wallet signature
- Admin management UI working

---

## Step 5 — AI Builder & Analytics (Day 8–9)

### Goal

Add prompt-to-form generation plus AI-assisted dashboard analysis and aggregate analytics charts.

### Tasks

#### 5.0 Prompt-To-Form Builder

- [ ] Landing hero uses a prompt field, not only a "Create Form" button
- [ ] `builder` route accepts prompt handoff and surfaces the brief immediately
- [ ] Claude Haiku orchestration returns a compact draft form config
- [ ] Follow-up questioning stays intentionally short: only a few targeted questions when required
- [ ] Supporting docs/screenshots/audio notes can be uploaded, stored on Walrus, and referenced during orchestration
- [ ] Draft versions can be saved as Walrus blobs for resume/version history

#### 5.1 Groq Integration (`lib/ai.ts`)

- [ ] `analyzeSubmission(responses: Record<string, any>): Promise<AIAnalysis>` — calls Groq llama-3.1-8b
- [ ] Returns: `{ sentiment, score, summary, topics, suggested_priority }`
- [ ] Handles rate limits (retry with backoff)
- [ ] Results cached in memory by submission ID

#### 5.2 Per-Submission AI Panel

- [ ] "Analyze" button on detail panel → triggers Groq call
- [ ] Shows: sentiment badge, summary text, topic chips, suggested priority
- [ ] Loading state while Groq responds (~1s typically)

#### 5.3 Analytics Overview Page (`/dashboard/analytics`)

- [ ] Submissions over time (line chart — Recharts)
- [ ] Sentiment breakdown donut (positive/neutral/negative %)
- [ ] Topic frequency bar chart (top 10 topics across all submissions)
- [ ] Average completion time
- [ ] Most-skipped fields (fields with the most null values)
- [ ] Device/browser breakdown (from user-agent metadata)

#### 5.4 Chart Animations

Run `/impeccable animate` on chart components:

- Line chart draws from left on mount, 600ms ease-out-quart
- Bar chart bars rise from baseline, 400ms with stagger
- Donut chart segments fill clockwise, 500ms
- All `prefers-reduced-motion` fallbacks: instant render

### Deliverables

- AI analysis working in dashboard detail panel
- Analytics overview page with all 6 charts

---

## Step 6 — Landing Page (Day 9)

### Goal

A clean marketing page for Scrolls that works as the home of `scrolls.fun`.

### Impeccable Workflow

Run `/impeccable craft "marketing landing page for Scrolls, a Walrus-native form builder"` with brief:

- **Audience**: Technical users discovering from Twitter/Discord. They read developer docs. No hand-holding.
- **Tone**: Confident, no marketing fluff. The product speaks.
- **Most important**: Get to the "Create Form" CTA fast. Don't bury it.
- **Anti-references**: SaaS landing pages with stock photos. Animated gradient heroes.

### Sections

- [ ] Hero: product name, concise tagline, AI prompt textarea, manual builder fallback
- [ ] 3-step flow: Describe → Refine → Publish
- [ ] Feature grid — use higher-craft visuals; Seal and AI tiles can use Lottie instead of generic icons
- [ ] No redundant "see how it works" CTA if the page already explains the flow
- [ ] Footer — built with love on Walrus, mobile apps coming soon

### Deliverables

- Landing page at `/`
- Responsive (mobile, tablet, desktop)
- All animations purposeful

---

## Step 7 — Polish & Hardening (Day 9–10)

### Goal

Close the gap between "works" and "feels right". Production-ready for every edge case.

### 7.1 `/impeccable polish` pass (full app)

- Every interactive element: hover, active, focus states all clean
- Consistent spacing throughout (no random gap values)
- All text contrast passes WCAG AA
- Typography scale used consistently (no one-off font sizes)
- Button states: default → hover → active → loading → success → error

### 7.2 `/impeccable harden` pass

Edge cases to handle:

- [ ] Walrus aggregator timeout (> 10s) → show retry with helpful message
- [ ] Wallet disconnected mid-flow → save state, re-prompt connect
- [ ] Form config blob not found (404) → graceful "Form not found or expired" page
- [ ] Zero submissions state → empty state with illustration + CTA
- [ ] Form closed (past `close_at`) → clear closed message, no submit button
- [ ] Max submissions reached → clear message
- [ ] File too large → friendly error inline (not toast)
- [ ] Seal decryption failed → explain why (not authorized, or policy expired)

### 7.3 `/impeccable adapt` pass (responsive)

- [ ] Form builder: tablet layout (stacked panels)
- [ ] Public form: works perfectly on mobile (all field types functional)
- [ ] Dashboard: table → card list on mobile
- [ ] Analytics: charts reflow to single column on mobile

### 7.4 Accessibility

- [ ] All interactive elements keyboard-navigable
- [ ] Focus rings visible (not hidden with `outline: none`)
- [ ] Form fields have `<label>` associations
- [ ] ARIA roles on custom components (drag handles, star raters, etc.)
- [ ] Screen reader announces submission success

### Deliverables

- All `prefers-reduced-motion` fallbacks in place
- Zero console errors
- All edge cases handled with clear UI feedback
- Responsive at all breakpoints

---

## Step 8 — Walrus Sites Deployment (Day 10)

### Goal

Deploy Scrolls to Walrus Mainnet and verify everything works end-to-end.

### Tasks

#### 8.1 Static Export Validation

- [ ] Run `next build` with `output: 'export'` — zero build errors
- [ ] All pages render correctly from the `./out` directory
- [ ] No server-side dependencies slipped in

#### 8.2 Environment Configuration (Mainnet)

- [ ] Switch `NEXT_PUBLIC_SUI_NETWORK` to `mainnet`
- [ ] Update Walrus aggregator/publisher URLs to mainnet endpoints
- [ ] Deploy Sui Move contract to mainnet, record package ID

#### 8.3 Walrus Sites Deploy

```bash
site-builder deploy ./out --config site-builder.yaml
# Record: Sui object ID of the site
```

#### 8.4 SuiNS Registration

- [ ] Register SuiNS name `scrolls`
- [ ] Point to site object ID
- [ ] Verify `scrolls.fun` resolves

#### 8.5 End-to-End Smoke Test (Mainnet)

- [ ] Create a test form on mainnet
- [ ] Submit a test response (with file upload)
- [ ] Verify response appears in dashboard
- [ ] Verify private form encryption/decryption works
- [ ] Verify Groq AI analysis works in production

### Deliverables

- Scrolls live on `scrolls.fun`
- All features verified on mainnet
- Test submission documented (screenshot/video)

---

## Step 9 — Demo & Submission (Day 10–11)

### Goal

Create the submission artifacts required by the bounty: demo video, one-pager, and the submission itself.

### The Recursive Demo

The bounty requires:
> A sub-3-min demo video **hosted on Walrus** and **made using your own tool**

This means:

1. Build a screen recording form in Scrolls (video upload field + "What's your demo of?" text field)
2. Record the demo video (screen capture, 3 min max)
3. Submit the video through Scrolls's own form — this uploads it directly to Walrus
4. Get the blob ID from the submission
5. Reference that blob ID as the video link in the DeepSurge submission

This is the proof-of-product moment.

### Tasks

- [ ] Record demo video (3 min): landing → create form → fill all field types → submit → view in dashboard → decrypt private submission → AI analysis → export
- [ ] Upload via Scrolls form → get Walrus blob ID
- [ ] Write submission one-pager (README.md already serves this)
- [ ] Screenshot: form builder, public form, dashboard (for README assets)
- [ ] Submit on DeepSurge: <https://deepsurge.xyz/hackathons/c2c48b38-33a7-405c-922b-a3be2ad25158>
- [ ] Post on Twitter: tag @WalrusProtocol and @walgo_xyz

### Deliverables

- Demo video hosted on Walrus (blob ID documented)
- DeepSurge submission completed
- GitHub repo public and polished

---

## Impeccable Command Summary

| Milestone | Command | Purpose |
|---|---|---|
| 0 | `/impeccable teach` | Generate PRODUCT.md |
| 0 | `/impeccable document --seed` | Generate DESIGN.md |
| 1 | `/impeccable craft "form builder"` | Shape + build form builder |
| 1 | `/impeccable animate` | Add builder micro-animations |
| 2 | `/impeccable shape "form renderer"` | Brief before building public form |
| 3 | `/impeccable craft "admin dashboard"` | Shape + build dashboard |
| 3 | `/impeccable animate` | Add dashboard animations |
| 5 | `/impeccable animate` | Add chart entrance animations |
| 6 | `/impeccable craft "landing page"` | Shape + build marketing page |
| 7 | `/impeccable polish` | Final detail pass |
| 7 | `/impeccable harden` | Edge cases + error states |
| 7 | `/impeccable adapt` | Responsive layout pass |
| Post-build | `/impeccable critique` | Score and find remaining gaps |
| Post-build | `/impeccable document` | Regenerate DESIGN.md from implemented tokens |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Walrus Mainnet storage costs exceed WAL balance | Medium | High | Test write costs on devnet first, pre-fund wallet |
| Seal SDK integration complex or undocumented | Medium | High | Start Seal spike in Step 0, not Step 4 |
| `next export` incompatibility with a dependency | Low | High | Verify each dep's browser-only support before adding |
| SuiNS name `scrolls` already taken | Medium | Low | Prepare fallback names: scrolls-app, openscrolls, scrolls-fun |
| Groq API key exposed in static bundle | High | High | Proxy through a Cloudflare Worker, or use public-safe Groq endpoints only |
| site-builder CLI changes for Mainnet | Low | Medium | Pin CLI version, test on testnet first |
| Demo video > 3 min | Low | Low | Script the demo before recording |

---

## Next Steps (Immediate)

After reviewing and approving this plan, the order is:

1. **Name decision** — confirm "Scrolls" (or pick an alternative) so SuiNS can be registered early
2. **Image assets** — yes, please start on these:
   - App icon/logo (the "Scrolls" wordmark or icon)
   - Hero screenshot (can be a designed mockup before code)
   - Possibly a simple architecture diagram (SVG)
3. **Run the brand-design skill** — once the name is locked, we run the brand pass to generate `brand.md`, pick the color palette, and set the visual north star
4. **Scaffold + DESIGN.md** — Step 0 starts, project initialized
5. **Walrus Seal spike** — small proof-of-concept: encrypt a string, store on Walrus, decrypt. De-risk this immediately
6. **Build** — Step 1 through 8

> Design question for you: do you want light mode only, dark mode only, or both? Scrolls at its cleanest would be light-mode-first (like Linear), but a dark mode is strong for developer tools. This affects the brand pass significantly.
