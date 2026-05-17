# Scrolls — Product Specification

**Last updated**: May 2026
**Status**: Shipped product

---

## 1. Product thesis

Scrolls is a Walrus-native form and feedback platform for teams that want more than a hosted form SaaS. The product is built around one core promise: create a form, share it anywhere, and keep every response on Walrus permanently.

The differentiator is not "forms, but crypto." The differentiator is that storage, privacy, and distribution are part of the product surface:

- Forms, submissions, and attachments are stored on Walrus.
- Private responses are encrypted in the browser before upload.
- The site itself can be served from Walrus Sites.
- Sharing is designed for normal users, not just wallet-native users.

---

## 2. Current architecture

| Layer | Current implementation |
| --- | --- |
| Frontend | Next.js 16 static export in `app/` |
| Permanent storage | Walrus mainnet for form blobs, submission blobs, and attachment blobs |
| On-chain references | Sui testnet `FormPointer`, `SubmissionRef`, and `FormPolicy` objects |
| AI and short links | Cloudflare Worker in `ai-proxy/` |
| Programmatic surfaces | `@scrolls/sdk`, `@scrolls/cli`, `@scrolls/mcp` |

There is no backend database. The browser talks directly to Walrus, Sui, and the Worker.

---

## 3. Core user flows

### Create

Creators can start from:

- A manual drag-and-drop builder
- A natural-language prompt
- Extra context such as image, PDF, audio, or video
- Voice input transcribed through Whisper

Generated drafts can be refined before publish.

### Share

Once published, a form gets:

- A public URL at `/f?id=<form-id>`
- A QR share card
- Optional short-link creation through the Worker
- A PNG export for distribution on social or chat

### Collect

Respondents can submit:

- Without a wallet when anonymous responses are allowed
- With an optional wallet signature when they want to attest authorship
- With text, rich text, dropdowns, multi-select, star ratings, URLs, files, and video uploads

Every response is stored as a Walrus blob. Attachments are uploaded as separate Walrus blobs and referenced from the submission.

### Review

The owner-facing inbox supports:

- Per-form response review
- Inline notes and priority tagging
- AI summaries, sentiment, and topic clustering
- CSV and JSON export

---

## 4. Feature surface

### Form builder

Supported field types:

- `short_text`
- `long_text`
- `rich_text`
- `dropdown`
- `multi_select`
- `star_rating`
- `file_upload`
- `video_upload`
- `url`
- `confirm_checkbox`

Per-form settings include:

- Title and description
- Public vs private mode
- Anonymous responses on or off
- Response caps
- Close date
- Confirmation message

### Public form experience

The public form is rendered client-side from the Walrus-hosted config. For public forms, the submission body is stored as plaintext JSON. For private forms, the submission body is encrypted before upload.

### Private responses

Private forms use a browser-side ECIES envelope:

- ECDH P-256
- HKDF-SHA256
- AES-GCM-256

The creator's public key is stored with the form config. The matching private key stays in the creator's browser, with backup export support.

### AI features

AI is used in two places:

- Form generation from prompts and attachments
- Response analysis for summaries, sentiment, topic extraction, and suggested priority

Claude Haiku powers generation and analysis. Whisper powers transcription.

### Programmatic use

Scrolls is available beyond the web UI:

- SDK for Node workflows
- CLI for YAML-driven publishing
- MCP server for agent-driven creation, submission, and export

---

## 5. Data model summary

### FormConfig

A form config contains:

- Form metadata such as title and description
- An ordered array of fields
- Form settings such as `isPrivate` and `allowAnonymous`
- Owner address
- Walrus blob id after publish
- Optional pointer id and policy id for on-chain flows

### Submission

A submission contains:

- Submission id
- Form id
- Array of field responses
- Submission timestamp
- Optional submitter address
- Optional wallet signature block
- Walrus blob id after upload

### Attachment references

File and video fields store a Walrus blob reference that includes:

- Blob id
- Mime type
- Size
- Optional filename

---

## 6. Operational notes

- Public respondents do not need a wallet unless the form owner disables anonymous responses.
- Wallet signatures on submissions are optional and additive; they do not block anonymous collection.
- The current shipped registry and policy objects live on Sui testnet.
- For the most reliable admin verification flow, include at least one wallet-signed submission during testing.
- Private response access depends on the creator retaining the exported key backup.

---

## 7. Repository pointers

- `app/` — canonical product app
- `ai-proxy/` — Claude, Whisper, and short-link Worker
- `move/scrolls/` — Sui Move package
- `packages/` — SDK, CLI, and MCP packages
- `docs/PROGRAMMATIC.md` — programmatic guide
- `docs/TESTING.md` — testing guide
