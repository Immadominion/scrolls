# Scrolls — Product Specification

**Version**: 0.2.0
**Last updated**: November 2025
**Status**: Walrus-native MVP shipped — see §0 for current implementation

---

## 0. Implementation Status (current)

Scrolls is split into what is live today and what is coming next:

### Today — what is live

The product runs end-to-end with **no Move contract** and **no backend server**.

- **Form storage**: every `FormConfig` is uploaded to Walrus. The form's identity *is* its Walrus blob ID — there is no separate `id` field. The share URL is `scrolls.fun/f?id=<walrus-blob-id>`.
- **Submission storage**: each response is uploaded to Walrus. The submission's identity *is* its blob ID, surfaced to the respondent as a copyable "Walrus receipt" on the thank-you screen.
- **Indexing (per-browser)**: the dashboard uses `localStorage` to track `forms[]` (per connected wallet) and `submissions[formId][]`. Storage keys: `scrolls:forms:<address|anonymous>` and `scrolls:submissions:<formId>`. Anonymous draft forms are auto-adopted on wallet connect.
- **Wallets**: `@mysten/dapp-kit-react` 2.x for browser-extension wallets (Sui Wallet, Suiet, Phantom Sui) **+ `@mysten/enoki` 1.x** for `Sign in with Google` (zkLogin). Enoki registers via the Sui Wallet Standard so the same `useSignAndExecuteTransaction` hook works for both.
- **AI**: Claude Haiku 4.5 (form generation, analysis) + Whisper (voice → form) via a Cloudflare Worker proxy in `ai-proxy/`. Browser never sees the keys.

### Next — on-chain index and Seal access policies

- **`FormRegistry` + `SubmissionRef` Move objects**: replaces local indexes so dashboards work cross-device, enables analytics from a single source of truth.
- **Seal-based access control** for private forms: replaces the current single-key ECIES envelope (which already encrypts client-side) with Seal's `seal_approve*` policies — enabling shared access for multiple admins, time-locked decryption, and sponsored decryption flows.
- **`FormRegistry` Move contract** (`docs/ENGINEERING-PLAN.md` §Move): replaces per-browser localStorage so the dashboard works on any device.
- **`SubmissionRef` Move objects** per response: replaces local submission index, enabling shared decryption flows and analytics from a single source of truth.
- **End-to-end encryption is already live** via a Web Crypto ECIES envelope (ECDH P-256 + HKDF-SHA256 + AES-GCM-256). The next milestone swaps the single-key model for Seal so multiple admins can decrypt without sharing the raw key.
- **Sponsored transactions** via Enoki so respondents never need SUI to submit.

The rest of this document describes the full target product. Anything marked *(planned)* is not yet implemented.

---

## 1. Vision

Scrolls is a Walrus-native form and feedback platform. The product solves a real problem: teams building on Sui and Walrus have no purpose-built way to collect structured feedback, run bug reports, or manage form responses without resorting to Web2 tools that sit outside their decentralized stack.

**Core promise**: Create a form, share a link, every response lives on Walrus permanently. No servers to maintain, no SaaS subscriptions, no data vendor lock-in.

**Strategic differentiator**: Scrolls is not a Typeform clone wrapped in web3 rhetoric. It is designed from the ground up as a Walrus-native product — the storage layer is the product. Files go directly to Walrus. Sensitive responses are end-to-end encrypted in the browser before they ever leave it. The entire application itself is served from Walrus.

---

## 2. Target Users

### Primary: Protocol & dApp Teams on Sui

- Building products on Sui/Walrus and need structured feedback channels
- Want bug reports, feature requests, or grant applications in one place
- Technically comfortable but want UI, not scripts
- **What they care about**: data ownership, permanence, encryption, not paying for another SaaS

### Secondary: Community Managers & DAO Operators

- Running governance surveys, grant applications, contributor applications
- Need to collect responses from pseudonymous/anonymous participants
- **What they care about**: ease of sharing, accessible forms, export for analysis

### Tertiary: Hackathon Builders (meta-use)

- Using Scrolls to collect beta feedback on their own projects
- **What they care about**: quick setup, shareable link, looks professional

---

## 3. Feature Specification

### 3.1 Form Builder

The form builder is a single-page interactive editor. No page reloads. Fields are added, reordered, and configured inline.

#### Field Types

| Type | Input | Storage |
|------|-------|---------|
| `short_text` | Single-line input | String |
| `long_text` | Multi-line textarea | String |
| `rich_text` | Tiptap WYSIWYG editor | HTML string |
| `dropdown` | Select from options | String (selected value) |
| `multi_select` | Checkbox group | String[] |
| `star_rating` | 1–5 clickable stars | Number (1–5) |
| `file_upload` | File picker, drag-drop | Walrus blob ID (string) |
| `video_upload` | Video file picker | Walrus blob ID (string) |
| `url` | URL input with validation | String (URL) |
| `confirm_checkbox` | Single labeled checkbox | Boolean |

#### Field Configuration (per field)

- `label` (string, required) — displayed above the field
- `placeholder` (string, optional) — hint text inside the field
- `help_text` (string, optional) — secondary text below the field
- `required` (boolean) — whether the field must be filled to submit
- `options` (string[], for dropdown/multi_select) — list of choices
- `max_file_size` (number, for file/video uploads) — limit in MB
- `accepted_types` (string[], for file/video uploads) — e.g. `["image/*", "application/pdf"]`

#### Form-Level Settings

- `title` (string, required)
- `description` (string, optional)
- `cover_image` (Walrus blob ID, optional)
- `is_private` (boolean) — if true, responses are end-to-end encrypted with the form's ECDH P-256 public key (`encryption_public_key`)
- `encryption_public_key` (JWK, optional) — set automatically when `is_private` is true; matching private key lives in the owner's browser localStorage with a downloadable backup
- `allow_anonymous` (boolean) — if false, requires wallet connection to submit
- `close_at` (ISO timestamp, optional) — form stops accepting submissions after this time
- `max_submissions` (number, optional) — hard cap on response count
- `success_message` (string, optional) — shown after successful submission

### 3.2 Form Rendering (Public)

When a respondent opens a form link:

1. Form config is fetched from Walrus using the blob ID embedded in the URL
2. Form renders client-side from the JSON config — no build step, no backend
3. File uploads go directly to Walrus from the browser (blob API)
4. On submit: response JSON is assembled. If the form has an `encryption_public_key`, the JSON is encrypted with an ECIES envelope (fresh ephemeral keypair → ECDH → HKDF → AES-GCM-256) before being stored as a Walrus blob. Otherwise it is stored as plaintext JSON.
5. The submission blob ID is then recorded on Sui (linked to the form's registry object)

**Form URL format**: `scrolls.fun/f?id=<form-id>`

`<form-id>` resolves to the Walrus blob ID for the form config. The query-param route is deliberate because the production build uses static export.

### 3.3 Admin Dashboard

The dashboard is the core value-add beyond a basic form tool.

#### Submission List View

- Table/card toggle
- Columns: submitted at, submitter (wallet or anonymous), star preview, status tag
- Sort by: date, priority, status
- Filter by: date range, field value, keyword, status, submitter
- Bulk select → bulk tag, bulk export, bulk archive

#### Submission Detail View

- Full response rendering (all fields, inline file previews)
- Image/video previews loaded from Walrus blob IDs
- Encrypted fields show a lock icon until decrypted
- Inline notes editor (notes stored locally in browser or on-chain as encrypted blob)
- Priority selector: Critical / High / Medium / Low / Closed
- Status: New → In Review → Resolved / Won't Fix

#### AI Analysis Panel (per submission)

- Sentiment score (positive / neutral / negative) — via Claude Haiku 4.5 (proxied through the Cloudflare Worker)
- Topic tags (auto-extracted) — e.g. "onboarding", "performance", "wallet connect"
- Suggested priority based on language intensity
- One-line summary of the submission

#### Analytics Overview (aggregate)

- Submissions over time (line chart)
- Completion rate (started vs. submitted)
- Average time to complete
- Most-skipped fields (signals confusing UX)
- Sentiment trend over time
- Topic frequency (bar or bubble chart)
- Device type breakdown (from user-agent metadata)

#### Export

- CSV export (one row per submission, columns = fields)
- JSON export (full structured data)
- Filtered export (only apply currently active filters)

### 3.4 End-to-End Encryption (Private Forms)

When `is_private: true`:

1. **Form creator** — at publish time the browser generates a fresh ECDH P-256 keypair via the Web Crypto SubtleCrypto API. The public JWK is embedded in the `FormConfig` blob on Walrus; the private JWK is stored in `localStorage` (`scrolls:formkey:<formId>`) with a downloadable JSON backup file the owner is prompted to save.
2. **On submission**: the respondent's browser generates an ephemeral ECDH keypair, derives a shared secret with the form's public key, derives an AES-GCM-256 key via HKDF-SHA256, and encrypts the submission JSON with a fresh 12-byte IV. The Walrus blob stores `{ v, alg: "ECDH-P256+HKDF-SHA256+AES-GCM-256", ephemeralPub, iv, ciphertext }` — all base64url. Plaintext never leaves the respondent's browser.
3. **Dashboard decryption**: the responses viewer detects the envelope shape, loads the form's private key from `localStorage` (or prompts the owner to import the key backup if missing), and decrypts in the browser. Plaintext is never persisted anywhere.
4. **Seal upgrade (not done yet)**: the single-key model means losing the backup file means losing access to all responses. The planned upgrade migrates the privacy primitive to Seal with a deployed Move package containing `seal_approve*` functions, enabling multi-admin allowlists, time-locked decryption, and recovery without a single point of failure.

### 3.5 AI Form Builder (Planned Next)

The landing experience should not stop at a "Create form" button. It should accept intent.

- Hero input accepts a short natural-language brief instead of a simple CTA
- Model: Claude Haiku, called through a thin client-safe proxy
- Inputs: short prompt first, then optional supporting docs, screenshots, prior form drafts, and audio transcripts
- Output: a compact `FormConfig` draft plus at most 3 targeted follow-up questions if the request is underspecified
- Prompting rule: keep forms lean; do not generate bloated questionnaires when the user only asked for a precise operational form

#### Walrus Features Used By The AI Builder

- Supporting files uploaded by the creator can be stored as Walrus blobs and referenced during generation
- Draft form versions can be persisted as Walrus JSON blobs for version history or restoration
- Audio notes can be transcribed client-side or via proxy, then stored as transcript blobs alongside the draft session
- Published outputs remain standard `FormConfig` Walrus blobs; AI does not create a separate storage lane

### 3.6 Landing Page (Marketing)

Scrolls needs a clean landing page as the entry point:

- Product hero with prompt textarea for AI-assisted form creation
- Feature breakdown (3 columns)
- 3-step visual (Describe → Refine → Publish)
- Social proof placeholder (testimonial slots)
- CTA: AI prompt input + manual builder fallback
- Footer: "Built with love on Walrus" + Android/iOS coming soon

### 3.7 Authentication & Storage Sponsorship

- **Creator auth**: form creation, publishing, dashboard access, decryption, and admin management are wallet-authenticated.
- **Two ways to connect**:
  1. **Browser-extension wallets** (Sui Wallet, Suiet, Phantom-Sui) via `@mysten/dapp-kit-react` 2.x.
  2. **Sign in with Google** via `@mysten/enoki` (zkLogin). Enoki registers as a Sui Wallet Standard wallet, so it appears in the same Connect modal as extension wallets and uses the same `useSignAndExecuteTransaction` hook downstream. Configure with `NEXT_PUBLIC_ENOKI_API_KEY` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; if either is empty the Enoki entry simply does not appear.
- **Respondent auth**: anonymous by default when `allow_anonymous = true`; wallet-gated submissions are an explicit per-form choice.
- **Cross-device continuity**: *(planned)* — currently the per-wallet form list lives in `localStorage`. The (planned) Move contract `FormRegistry` will hold the canonical mapping from `owner_address → form_blob_id[]` so the dashboard works on any device.
- **Who pays Walrus / Sui costs**:
  - Walrus blob writes: today the connected wallet's Walrus quota is used.
  - Sui gas: *(planned)* respondents will submit through Enoki **sponsored transactions** so they never need SUI in their wallet.

---

## 4. Data Models

### FormConfig (stored as Walrus blob)

```typescript
interface FormConfig {
  id: string;                     // UUID generated on creation
  version: "1.0";                 // schema version
  title: string;
  description?: string;
  cover_image_blob_id?: string;   // Walrus blob ID
  created_at: number;             // Unix timestamp (ms)
  owner_address: string;          // Sui wallet address
  fields: FormField[];
  settings: FormSettings;
}

interface FormField {
  id: string;                     // UUID
  type: FieldType;
  label: string;
  placeholder?: string;
  help_text?: string;
  required: boolean;
  options?: string[];             // for dropdown / multi_select
  max_file_size_mb?: number;
  accepted_file_types?: string[];
  order: number;
}

interface FormSettings {
  is_private: boolean;
  allow_anonymous: boolean;
  close_at?: number;
  max_submissions?: number;
  success_message?: string;
}
```

### Submission (stored as Walrus blob — encrypted if private)

```typescript
interface Submission {
  id: string;                     // UUID
  form_id: string;                // matches FormConfig.id
  submitted_at: number;           // Unix timestamp (ms)
  submitter_address?: string;     // null if anonymous
  completion_time_ms: number;     // time from first interaction to submit
  user_agent?: string;            // for device analytics
  responses: Record<string, SubmissionResponse>;
}

type SubmissionResponse =
  | string           // short_text, long_text, rich_text, url
  | number           // star_rating
  | boolean          // confirm_checkbox
  | string[]         // multi_select
  | WalrusBlobRef;   // file_upload, video_upload

interface WalrusBlobRef {
  blob_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}
```

### On-chain (Sui Move) — FormRegistry

```move
struct FormRegistry has key {
    id: UID,
    owner: address,
    forms: Table<String, FormEntry>,  // form_id -> FormEntry
}

struct FormEntry has store {
    config_blob_id: vector<u8>,   // Walrus blob ID for FormConfig
    submission_count: u64,
    created_at: u64,
    is_private: bool,
    seal_policy_id: Option<ID>,   // Seal policy object ID
}

struct SubmissionRef has key {
    id: UID,
    form_id: String,
    blob_id: vector<u8>,          // Walrus blob ID for Submission
    submitted_at: u64,
    is_encrypted: bool,
}
```

---

## 5. User Flows

### Flow 1: Creating a Form

```
1. Land on scrolls.fun
2. Type a short prompt into the landing hero or click manual builder
3. Prompted to connect Sui wallet (dapp-kit modal) before publish/dashboard actions
4. Wallet connected → enter form builder
5. If AI path: Claude Haiku proposes a compact first draft and, if needed, asks only a few targeted follow-up questions
6. Set or refine form title, description, and fields
7. Configure each field inline
8. Open "Settings" panel → set privacy, anonymous, close date
9. Click "Publish"
10. App serializes FormConfig → stores as Walrus blob → gets blob ID
11. If private: creates Seal policy → stores policy ID on-chain
12. Registers form in FormRegistry Sui contract (owner's wallet signs tx)
13. Share link shown: scrolls.fun/f?id=<form-id>
14. Copy link → done
```

### Flow 2: Submitting a Response

```
1. Open form link: scrolls.fun/f?id=<form-id>
2. App resolves form-id → fetches FormConfig blob from Walrus
3. Form renders in browser
4. Respondent fills fields
5. File uploads: on file select, blob uploaded to Walrus immediately, blob ID stored locally
6. Click "Submit"
7. Response JSON assembled from all field values + blob refs
8. If form is private: JSON encrypted with Seal (form's policy key)
9. Encrypted/plaintext JSON stored as Walrus blob → blob ID returned
10. SubmissionRef object created on Sui (linked to form)
11. Success screen shown with custom success message
```

### Flow 3: Admin Dashboard

```
1. Navigate to scrolls.fun/dashboard
2. Wallet connect prompted (if not connected)
3. App queries Sui for all FormRegistry entries owned by this wallet
4. Dashboard loads with form list
5. Select a form → view submissions list
6. Submissions fetched: app reads SubmissionRef objects from Sui, then fetches blobs from Walrus
7. If encrypted: Seal decryption requested on-demand (wallet signature required)
8. View individual submission detail
9. Add notes, set priority/status
10. Run AI analysis (calls the client-safe AI proxy from browser)
11. Export CSV/JSON
```

---

## 6. Design Principles (Impeccable Integration)

### 6.1 The Brief (output of `/impeccable shape`)

- **Purpose**: Collect and organize structured feedback for teams building on Sui/Walrus
- **User**: A protocol founder, on desktop, likely at work. Comfortable with crypto, expects professional tooling
- **Content**: Dynamic (driven by form configs stored on-chain). No static data
- **Feeling**: Calm authority. Tools like Linear and Notion, not Airtable. Dense when it needs to be, breathable when it can be
- **Constraints**: Fully static (no SSR). Must work with slow Walrus aggregator fetches (skeleton states required)

### 6.2 Motion Rules

Following `/impeccable animate` discipline:

- **Entrances**: 220–300ms, opacity + translateY(8px), ease-out-quart
- **State feedback**: hover, active, focus via motion not color alone
- **Loading**: skeleton screens, not spinners in isolation
- **Submit success**: full-screen success state enters with opacity + scale, 280ms
- **Field focus**: border glow via box-shadow, 180ms
- **Field addition** (builder): new field slides in with grid-template-rows expansion
- **No bounce, no elastic** — all easing is exponential deceleration
- **`prefers-reduced-motion`**: every transition wrapped, falls back to instant

### 6.3 Typography

- Display / Headlines: [TBD in DESIGN.md — likely Geist or Inter Display]
- Body: Inter (clean, readable, web-safe)
- Mono (for IDs, blob references): Geist Mono
- Size scale: 12/14/16/20/24/32/48 — nothing in between

### 6.4 Color Strategy

- Primary: One committed accent (ocean-blue leaning, ties to Walrus marine brand)
- Surface: Near-white with subtle cool tint (not pure #FFFFFF)
- Muted: Tinted grays, same hue as accent
- Danger: Warm red (clear, not alarming)
- Status colors: priority-mapped (Critical = red, High = orange, Medium = yellow, Low = gray)

---

## 7. AI & Analytics Detail

### Prompt-To-Form Orchestration

- Model: Claude Haiku
- First input: freeform creator brief from the landing prompt field
- Optional context: docs, screenshots, previous forms, and audio transcripts
- Output target: a compact `FormConfig` draft, not a giant survey
- Clarification policy: ask only when a materially better form depends on the answer; cap follow-ups to a small set of precise questions
- Persistence: context files, transcripts, and saved drafts can all be stored as Walrus blobs so the builder session can resume without a traditional backend

### Sentiment Analysis (per submission)

- Input: all text fields concatenated
- Model: `llama-3.1-8b-instant` via Groq API (fast, cheap, edge-compatible)
- Output: `{ sentiment: "positive" | "neutral" | "negative", score: 0–1, summary: string }`
- Displayed as: colored badge + one-line summary

### Topic Extraction (per submission)

- Input: text fields
- Output: up to 5 topic tags from a predefined taxonomy + freeform
- Used for aggregate topic frequency chart in dashboard overview

### Suggested Priority

- Input: sentiment score + presence of specific language patterns (error, broken, can't, urgent, crash)
- Output: suggested priority level (Critical / High / Medium / Low)
- Displayed as: subtle suggestion chip, not overriding user's manual setting

### Aggregate Analytics

All analytics computed client-side from the fetched submission data — no separate analytics backend.

---

## 8. Non-Goals (Explicit Scope Limits)

- **No backend server** — everything client-side or on Walrus/Sui
- **No multi-workspace** — single owner per form registry (v1)
- **No email notifications** — out of scope for v1
- **No real-time collaboration** on the builder — single editor
- **No conditional logic** (show field B if field A = X) — v2
- **No payments / gating** — v2
- **No native mobile app** — responsive web only

---

## 9. Success Criteria (Bounty)

Per the Walrus Sessions Round 2 brief:

| Requirement | Implementation |
|---|---|
| Spin up forms for bug reports, feature requests, surveys, applications | ✅ Form builder with all field types |
| Rich text, dropdowns, checkboxes, star ratings, screenshots, video uploads, URLs, confirmation checkboxes | ✅ All field types implemented |
| Submissions stored on Walrus, organized per form | ✅ Walrus blobs + Sui registry |
| Sensitive data encrypted with Seal | ✅ Private form mode |
| Only form creators and approved admins can see private responses | ✅ Seal access policy management |
| Admin dashboard: sort, notes, prioritize, export | ✅ Full dashboard |
| Deploy on Mainnet | ✅ Walrus Sites deployment |
| Public repo | ✅ This repo |
| One-pager | ✅ README.md |
| Sub-3-min demo video hosted on Walrus and made using the tool | ✅ Recorded + submitted via Scrolls form |
| At least one test submission | ✅ Run during QA |
