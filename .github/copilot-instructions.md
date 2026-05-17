# Copilot Instructions — Scrolls Forms

## What This Project Is

**Scrolls** (`scrolls.fun`) is a Walrus-native form and feedback platform. Users create forms (bug reports, surveys, job applications), share a link, and every response is stored permanently on Walrus. Private responses are **end-to-end encrypted** in the browser using a Web Crypto ECIES envelope (ECDH P-256 + HKDF-SHA256 + AES-GCM-256) — see `app/src/lib/crypto.ts`. Phase 2 will migrate the privacy primitive to Seal for multi-admin policies. The admin dashboard includes AI-assisted form generation (Claude Haiku via Cloudflare Worker proxy) and a per-form responses viewer that decrypts client-side.

Built as a static export deployed on **Walrus Sites** (no backend server, ever).

Sub-projects:
- `app/` — **Canonical product**: form builder, public form renderer (`/f`), admin dashboard (`/dashboard`), per-form responses viewer (`/responses`). All code lives here.
- `ai-proxy/` — Cloudflare Worker that proxies Anthropic Claude Haiku 4.5 + OpenAI Whisper. Holds API keys; browser never sees them. Has KV-based rate limiting.
- `scrolls/scrolls-landing/` — Legacy marketing prototype (reference only, not the deployment target).

---

## Architecture (Phase 1 — current, shipped)

**No server, no backend.** Every data operation is browser → Walrus blob API or browser → Cloudflare Worker. `output: 'export'` in `next.config.ts` is non-negotiable. Never add `"use server"`, `getServerSideProps`, or API routes.

**Form ID === Walrus blob ID.** There is no separate identifier and no Move contract yet. Share URL is `/f?id=<walrus-blob-id>`.

**Data flow**:
- Form: `FormConfig JSON → uploadJSON() → Walrus blob → blobId becomes the form's id`
- Submission: `Submission JSON → uploadJSON() → Walrus blob → blobId is the receipt`

**Indexing (per-browser, Phase 1)**: `lib/formIndex.ts` keeps `scrolls:forms:<address|anonymous>` in localStorage; `lib/submissionIndex.ts` keeps `scrolls:submissions:<formId>`. Anonymous draft forms are auto-adopted on wallet connect via `adoptAnonymousForms()`. Phase 2 replaces both with on-chain Move objects.

**Walrus reads are slow (~1–3s)**. Every component that fetches from Walrus must render a skeleton screen first. Use `grid-template-rows` expansion for layout-shifting content, never `height` transitions.

---

## Wallet Stack (lock to these versions)

- `@mysten/dapp-kit-react` **2.x** (NEW dapp kit — NOT legacy `@mysten/dapp-kit`)
- `@mysten/sui` 2.x with `SuiGrpcClient` from `@mysten/sui/grpc`
- `@mysten/walrus` 1.x
- `@mysten/enoki` **1.x** for Sign-in-with-Google (zkLogin), registered via the Sui Wallet Standard

Module augmentation is required: `declare module '@mysten/dapp-kit-react' { interface Register { dAppKit: typeof dAppKit } }` (in `app/src/lib/dapp-kit.ts`).

**Provider mounting**: `app/src/providers/Providers.tsx` lazy-imports `DAppKitProvider` inside `useEffect` to avoid `window`/`document` access during static prerender. Children render unwrapped before mount — wallet-dependent components MUST use the safe wrappers in `app/src/lib/useScrollsAccount.ts` (which catch the "Could not find DAppKitContext" error during SSR).

**Enoki**: registered by `app/src/components/wallet/EnokiWalletsRegister.tsx` (mounted as a child of `DAppKitProvider`). It silently no-ops if `NEXT_PUBLIC_ENOKI_API_KEY` or `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is missing, so builds work without secrets. Once configured, the Google entry appears in the same Connect modal as extension wallets, and `useSignAndExecuteTransaction` works transparently for both.

**Build warning** `Skipping wallet initializer: ReferenceError: document is not defined` is benign — do not try to fix.

---

## Design System (strictly enforce)

**Brand**: Scrolls. Logo: twisted 4-pointed star glyph.
**Colors**: `#0a0a0a` background, `#a78bfa` (violet-400) primary, `#06b6d4` (cyan) secondary. No rainbow gradients. No neon glows on body elements.
**Typography**: `Syne` (display, `font-display`), `Inter` (body, `font-sans`). No other fonts.
**Motion rules** (impeccable.style discipline):
- Animate `transform` + `opacity` only. Never `width`, `height`, `top`, `left`
- Use `grid-template-rows` for height expansion (accordion / response row expand)
- Easing: `[0.25, 0.4, 0.25, 1]` — exponential deceleration only. No bounce, no elastic
- Duration: 200–300ms for UI feedback, 500–700ms for page-level entrances
- Skeleton screens, not isolated spinners

---

## Key File Locations

| What | Path |
|---|---|
| App routes | `app/src/app/{page.tsx,builder,dashboard,f,responses}/page.tsx` |
| Builder UI | `app/src/components/builder/` |
| Public form | `app/src/components/form/PublicFormPage.tsx` |
| Dashboard | `app/src/components/dashboard/DashboardPage.tsx` |
| Responses viewer | `app/src/components/responses/ResponsesPage.tsx` |
| Wallet wrappers | `app/src/lib/useScrollsAccount.ts`, `app/src/components/wallet/` |
| Walrus client | `app/src/lib/walrus.ts` |
| LocalStorage indexes | `app/src/lib/formIndex.ts`, `app/src/lib/submissionIndex.ts` |
| Sui address utils | `app/src/lib/sui.ts` (no on-chain calls in Phase 1) |
| AI proxy | `ai-proxy/src/worker.ts` |
| Env example | `app/.env.example` |
| Product spec | `docs/SPEC.md` |
| Programmatic guide | `docs/PROGRAMMATIC.md` |
| Visual design doc | `scrolls/DESIGN.md` |

---

## Conventions

- All wallet-touching components are `"use client"` with Framer Motion (no RSC animations for product pages)
- Tailwind class order: layout → spacing → color → typography → animation
- `clsx` for conditional classes, never string interpolation
- Icon library: `@iconify/react` (`fluent:*` icons primary) + `lucide-react` (utility)
- Form field IDs are UUIDs (`crypto.randomUUID()`)
- Walrus blob IDs are `string` (base64url). Never cast to number.
- Sui addresses are `string`, displayed via `truncateAddress()` from `lib/sui.ts`
- No `any` types. Use the interfaces in `app/src/types/index.ts`
- Static export forbids dynamic routes (`/[id]`) without `generateStaticParams`. Use query-param routes (`/f?id=...`, `/responses?id=...`) instead.

---

## Commands

```bash
# App dev (the canonical product)
cd app && pnpm dev

# App build for Walrus Sites
cd app && pnpm build         # → app/out/

# AI proxy local dev
cd ai-proxy && pnpm dev      # → http://localhost:8787

# Deploy site to Walrus Sites
site-builder deploy ./out --config site-builder.yaml
```

---

## What NOT to do

- Do not add `"use server"` anywhere
- Do not add backend API routes that call a database
- Do not reintroduce legacy `@mysten/dapp-kit` (the non-`-react` package)
- Do not call `useCurrentAccount` / `useCurrentClient` directly from product code — use `useScrollsAccount` / `useScrollsDAppKit` so SSR prerender doesn't crash
- Do not add a Move contract or on-chain registry call in Phase 1 — that's Phase 2 (`FormRegistry` + `SubmissionRef`)
- Do not use dynamic Next.js routes (`/[id]`) — static export forbids them; use query params
- Do not use `next/image` with remote Walrus URLs (use `<img>` tags directly — static export limitation)
- Do not animate `height` or `width` directly — use `grid-template-rows` or `scaleY` + `transform-origin`
- Do not add decorative gradients on text that doesn't need emphasis
- Do not use `console.log` in production components (guard with `process.env.NODE_ENV === 'development'`)
- Do not hardcode API keys. `NEXT_PUBLIC_*` are public; private keys live ONLY as `wrangler secret`s in the Cloudflare Worker

