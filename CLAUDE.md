# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## Project Vision

**DealDiligence.ai** is a Claude-native M&A deal platform. Documents uploaded to a Virtual Data Room are read end-to-end by Claude Opus 4.7 and turned into CUAD-aligned markdown fact sheets (entities, CUAD clause coverage, /10 risk score, top risks, intra-document relationships). Those fact sheets are the currency of every downstream interaction: the Kanban becomes an AI prompting workflow where tasks carry a prompt + attached documents and Claude writes risk reports for specialist review; the VDR chat answers questions from in-scope fact sheets; a debounced reconciliation pass merges entities into a deal-level knowledge graph; the project dashboard surfaces deal-level risk posture — all filtered by the caller's folder scope.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full architecture diagram and rationale.

### Target users
Investment bankers · M&A lawyers · corporate development · PE/VC · auditors · any party in an M&A transaction.

### Compliance
SOC 2 Type 2, AI regulatory (US/EU), privacy law — targeted via AWS Bedrock hosting in prod.

### Platform
Web app only.

---

## Architecture at a glance

One Node/TypeScript backend, one LLM provider (Claude), one opinionated extraction pipeline. No Python sidecar, no vector DB, no secondary vendors for MVP.

### Claude hosting

| Environment | Provider | Notes |
|---|---|---|
| Dev | Direct Anthropic API (`CLAUDE_PROVIDER=anthropic`) | `ANTHROPIC_API_KEY` in `.env` |
| Prod | AWS Bedrock (`CLAUDE_PROVIDER=bedrock`) | Data stays in the customer's AWS account; inherits AWS SOC 2 Type 2 / HIPAA / ISO 27001; IAM auth; CloudTrail audit |

Same `@anthropic-ai/sdk` everywhere; client factory in `src/integrations/claude/client.ts`.

### Model tiering

| Stage | Model |
|---|---|
| Document extraction (per doc, one-time) | `claude-opus-4-7` |
| Kanban AI risk report | `claude-opus-4-7` (default) |
| VDR chat | `claude-haiku-4-5` |
| Cross-document reconciliation | `claude-sonnet-4-6` |

Prompt caching: the ~4k-token extraction system prompt (CUAD schema + risk rubric) and fact-sheet user-message blocks both use `cache_control: { type: 'ephemeral' }`.

### Retrieval

`src/integrations/retrieval/` defines a `Retriever` interface. Default `stuffRetriever` returns all in-scope fact sheets — no embeddings. When scale demands, swap in `PgVectorRetriever` or a provider (Voyage / Isaacus / OpenAI) behind the same interface.

---

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 24.x |
| Framework | Express.js 4.x |
| Language | TypeScript 5.x |
| Database | PostgreSQL 16.x |
| ORM | Prisma 5.x |
| LLM SDKs | `@anthropic-ai/sdk`, `@anthropic-ai/bedrock-sdk` |
| Document parsing | Claude native PDF input; `mammoth` for `.docx` |
| Auth | Auth0 (JWT RS256) |
| Validation | Zod 3.x |

---

## Common Commands

From `backend/`:

```bash
npm run dev                  # ts-node-dev --transpile-only, hot reload, port 3001
npm run db:local:start       # Docker postgres
npm run db:migrate           # Prisma migrations
npm run db:studio            # Prisma GUI
npm test                     # Vitest
npm run build                # tsc
```

From `frontend/`:

```bash
npm run dev                  # Vite, port 3000
npm run build                # tsc -b && vite build
npm run lint
```

---

## Module Structure

Each backend feature lives at `src/modules/<name>/`:
- `<name>.validators.ts` — Zod schemas
- `<name>.service.ts` — Prisma + business logic
- `<name>.controller.ts` — HTTP handlers
- `<name>.routes.ts` — Express router + middleware

### Core integration modules
- `src/integrations/claude/` — client factory, prompts, Zod schemas
- `src/integrations/retrieval/` — `Retriever` interface + `stuffRetriever`
- `src/services/extraction.service.ts` — Upload → Claude → S3 fact sheet → DB
- `src/services/reconciliation.service.ts` — Debounced project graph rebuild
- `src/modules/tasks/task-ai.service.ts` — Kanban AI task runner
- `src/modules/projects/dashboard.service.ts` — Folder-scoped dashboard aggregations

---

## Patterns

Async routes:
```ts
router.get('/', asyncHandler(async (req, res) => { ... }))
```

Errors:
```ts
throw ApiError.badRequest('message');
throw ApiError.notFound('Resource not found');
throw ApiError.forbidden('Insufficient permissions');
```

Validation:
```ts
const data = createProjectSchema.parse(req.body);
```

RBAC:
```ts
router.patch('/:id', requireMinRole('ADMIN'), controller.update);
```

---

## Role-based access

`OWNER (4) > ADMIN (3) > MEMBER (2) > VIEWER (1)`

OWNER/ADMIN have full access. MEMBER/VIEWER use `ProjectMember.permissions` JSON:
- `canAccessKanban`, `canAccessVDR`, `canUploadDocs`
- `restrictedToTags` — tasks filtered
- `restrictedFolders` — documents + entity aggregations filtered

Enforced in `documents.service.ts`, `dashboard.service.ts`, `chat.service.ts`, `task-ai.service.ts`.

---

## Environment Variables

Required in `backend/.env`:
- `DATABASE_URL`
- `AUTH0_AUDIENCE`, `AUTH0_ISSUER_BASE_URL`
- `FRONTEND_URL`
- `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (mock S3 runs if blank)
- **Claude (dev)**: `CLAUDE_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`
- **Claude (prod)**: `CLAUDE_PROVIDER=bedrock`, IAM role with `bedrock:InvokeModel`
- Model knobs: `CLAUDE_MODEL_EXTRACTION`, `CLAUDE_MODEL_REPORT`, `CLAUDE_MODEL_CHAT`, `CLAUDE_MODEL_RECONCILIATION`
- Bedrock model IDs: `CLAUDE_BEDROCK_MODEL_EXTRACTION`, etc.

Frontend `.env`: `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`.

When Claude isn't configured, extraction + chat + Kanban AI run in mock mode so the full UI flow is still exercisable.

---

## Testing

Vitest + supertest. Auth mocking via `setMockUser()` in `tests/utils/auth-mock.ts`. Separate `.env.test`. Tests in `backend/tests/integration/`.

---

## Key Files

| File | Purpose |
|---|---|
| `src/app.ts` | Express app + route mounting |
| `src/middleware/auth.ts` | JWT + user attach (mock-token fallback for dev) |
| `src/middleware/permissions.ts` | RBAC + folder scope |
| `src/utils/ApiError.ts` | Error helpers |
| `prisma/schema.prisma` | Canonical schema; `Document` has extraction + risk fields; `Task` has AI workflow fields (`aiPrompt`, `aiStatus`, `aiReportS3Key`, …) |
| `src/integrations/claude/index.ts` | Barrel for Claude runners + types |
| `src/services/extraction.service.ts` | Primary extraction entrypoint |

---

## Adding a feature

1. `src/modules/<name>/` — validators, service, controller, routes
2. Mount router in `src/app.ts`
3. Add integration test in `tests/integration/`
4. `npm test`

---

## Frontend Design Rules

### Always Do First
- **Invoke the `frontend-design` skill** before writing any frontend code, every session, no exceptions.

### Reference Images
- If a reference image is provided: match layout, spacing, typography, and color exactly. Swap in placeholder content (images via `https://placehold.co/`, generic copy). Do not improve or add to the design.
- If no reference image: design from scratch with high craft (see guardrails below).
- Screenshot your output, compare against reference, fix mismatches, re-screenshot. Do at least 2 comparison rounds. Stop only when no visible differences remain or user says so.

### Local Server
- **Always serve on localhost** — never screenshot a `file:///` URL.
- Start the dev server: `cd frontend && npm run dev` (Vite, port 3000)
- If the server is already running, do not start a second instance.
- Backend must also be running for API-backed pages: `cd backend && npm run dev` (port 3001).

### Screenshot Workflow
- Puppeteer is installed in `frontend/node_modules/puppeteer/`.
- **Always screenshot from localhost:** `cd frontend && node screenshot.mjs http://localhost:3000`
- Screenshots are saved automatically to `frontend/temporary screenshots/screenshot-N.png` (auto-incremented, never overwritten).
- Optional label suffix: `node screenshot.mjs http://localhost:3000 label` saves as `screenshot-N-label.png`
- `screenshot.mjs` lives in `frontend/`. Use it as-is.
- After screenshotting, read the PNG from `frontend/temporary screenshots/` with the Read tool — Claude can see and analyze the image directly.
- When comparing, be specific: "heading is 32px but reference shows ~24px", "card gap is 16px but should be 24px"
- Check: spacing/padding, font size/weight/line-height, colors (exact hex), alignment, border-radius, shadows, image sizing

### Brand Assets
- Check `brand_assets/` at the project root before designing (if present). It may contain logos, color guides, style guides, or images.
- If assets exist there, use them. Do not use placeholders where real assets are available.
- If a logo is present, use it. If a color palette is defined, use those exact values — do not invent brand colors.

### Anti-Generic Guardrails
- **Colors:** Never use default Tailwind palette (indigo-500, blue-600, etc.). Pick a custom brand color and derive from it.
- **Shadows:** Never use flat `shadow-md`. Use layered, color-tinted shadows with low opacity.
- **Typography:** Never use the same font for headings and body. Pair a display/serif with a clean sans. Apply tight tracking (`-0.03em`) on large headings, generous line-height (`1.7`) on body.
- **Gradients:** Layer multiple radial gradients. Add grain/texture via SVG noise filter for depth.
- **Animations:** Only animate `transform` and `opacity`. Never `transition-all`. Use spring-style easing.
- **Interactive states:** Every clickable element needs hover, focus-visible, and active states. No exceptions.
- **Images:** Add a gradient overlay (`bg-gradient-to-t from-black/60`) and a color treatment layer with `mix-blend-multiply`.
- **Spacing:** Use intentional, consistent spacing tokens — not random Tailwind steps.
- **Depth:** Surfaces should have a layering system (base → elevated → floating), not all sit at the same z-plane.

### Hard Rules
- Do not add sections, features, or content not in the reference
- Do not "improve" a reference design — match it
- Do not stop after one screenshot pass
- Do not use `transition-all`
- Do not use default Tailwind blue/indigo as primary color
