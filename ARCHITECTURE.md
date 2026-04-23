# DealDiligence.ai — Architecture

> Claude-native M&A risk-analysis platform. One backend runtime, one LLM provider, two-pass extraction, a living deal brief, playbook-conditioned risk scoring.

## One-paragraph mental model

Users upload deal documents to a **Virtual Data Room**. A **Haiku classifier** picks a document type (SPA / APA / LOI / NDA / Employment / Lease / Financial / Corporate / Generic). **Opus extracts** with a type-specific prompt + the project's **playbook** (customer's preferred clause positions + red flags). Every extraction then runs a **Sonnet verify pass** that reads the source PDF alongside the fact sheet, flagging hallucinated quotes, wrong pages, missing clauses, or risk-mismatches — and auto-correcting when safe. A deterministic **citation regex validator** catches obvious quote drift before the LLM verify. Each doc becomes a **CUAD-aligned markdown fact sheet** in S3 with a **/10 risk score computed as deviation from the playbook** (or absolute rubric when no playbook). A debounced **reconciliation pass** merges entities across documents, detects **cross-document peer-group anomalies**, and regenerates a per-scope **Deal Brief** — one living markdown artifact per project that synthesizes parties, clauses, risks, dates, inter-document relationships, and anomalies into a single cacheable context block. The Deal Brief is the primary context object for **chat**, **Kanban AI tasks**, and **dashboards**; per-doc fact sheets are loaded on-demand only when a user pins specific documents.

```
Upload
  → Haiku classify (first 2 pages, cheap)
  → Opus extract (native PDF + type-specific prompt + playbook, tool-use)
  → Citation regex validator (deterministic)
  → Sonnet verify (PDF + fact sheet, tool-use; auto-correct on CRITICAL)
  → factSheet.md stored in S3
  → Document rows populated (incl. verificationStatus, documentTypeConfidence)
  → Reconciliation (debounced 30s):
       • Sonnet merge entities + cross-doc relationships
       • Sonnet peer-group anomaly detection (flags outliers vs. peers in folder)
       • Sonnet Deal Brief generation (one per distinct scope key in use)

Kanban AI task (prompt + attached docs)
  → drag to IN_PROGRESS
  → Opus reads Deal Brief (scoped to user) + attached fact sheets
  → risk-report.md stored in S3

Chat (VDR)
  → Haiku reads Deal Brief (scoped) + optional pinned fact sheets
  → answer + citations
```

## Why Claude, not Claude + embeddings

Deal contexts are small-to-medium (dozens of docs per deal, thousands of tokens per fact sheet). Claude's long context + prompt caching covers retrieval for MVP without an embeddings vendor. When scale pushes beyond stuffing, swap `StuffRetriever` for a `PgVectorRetriever` (or Voyage / Isaacus) behind the same interface — no refactor.

## Claude hosting

| Environment | Provider | How |
|---|---|---|
| Local dev | Direct Anthropic API | `CLAUDE_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` |
| Staging / prod | AWS Bedrock | `CLAUDE_PROVIDER=bedrock`; IAM role grants `bedrock:InvokeModel`; data stays in customer AWS account |

Same `@anthropic-ai/sdk` everywhere; `backend/src/integrations/claude/client.ts` returns the right client. Model IDs are environment-configurable via `CLAUDE_MODEL_*` / `CLAUDE_BEDROCK_MODEL_*` env vars.

**Why Bedrock for prod:** inherits AWS SOC 2 Type 2 / HIPAA / ISO 27001, VPC endpoint isolation, CloudTrail audit on every inference, IAM auth (no rotating keys), and lines up with the existing AWS S3 + RDS footprint.

## Model tiering

| Stage | Model | Rationale |
|---|---|---|
| Document extraction | `claude-opus-4-7` | One-time per doc; catches subtle risk; worth the spend |
| Risk report (Kanban AI task) | `claude-opus-4-7` (default), `claude-sonnet-4-6` (knob) | User-facing output quality |
| Chat | `claude-haiku-4-5` | Fast, cheap, reads structured fact sheets |
| Reconciliation | `claude-sonnet-4-6` | Reads markdown, not PDFs — medium model is plenty |

Prompt caching is enabled on the extraction system prompt (~4k tokens of CUAD schema + rubric) and on fact-sheet user-message blocks during multi-turn flows — 90% discount on cache reads.

## Key files

| Layer | Path | Role |
|---|---|---|
| Config | `backend/src/config/index.ts` | `CLAUDE_PROVIDER`, model IDs, `CLAUDE_EXTRACTION_THINKING_BUDGET`, S3, Auth0 |
| Claude integration | `backend/src/integrations/claude/` | `client.ts`, `tool-use.ts`, `classify.ts`, `extract.ts`, `verify.ts`, `deal-brief.ts`, `anomaly.ts`, `riskReport.ts`, `chat.ts`, `reconcile.ts`, `schema.ts`, `prompts/*` |
| Extraction prompts | `backend/src/integrations/claude/prompts/extraction/` | `shared.ts` (CUAD + rubric + self-critique), `types.ts` (8 type-specific guidance blocks), `few-shot.ts`, `index.ts` composer |
| Retrieval | `backend/src/integrations/retrieval/` | `Retriever` interface + `stuffRetriever` (used only for pinned-doc mode now) |
| Extraction pipeline | `backend/src/services/extraction.service.ts` | classify → extract → citation-validate → verify → persist |
| Reconciliation | `backend/src/services/reconciliation.service.ts` | Entity merge + peer-anomaly detection + per-scope brief generation |
| Deal Brief | `backend/src/services/deal-brief.service.ts` | Load + save scoped briefs; human-section splicing |
| Playbook | `backend/src/services/playbook.service.ts` | Per-project standard positions + red flags |
| Task AI runner | `backend/src/modules/tasks/task-ai.service.ts` | Reads brief + attached fact sheets, runs Opus report |
| Dashboard | `backend/src/modules/projects/dashboard.service.ts` | Folder-scoped aggregations |
| Chat | `backend/src/modules/chat/chat.service.ts` | Haiku on Deal Brief + optional pinned docs |
| Citation validator | `backend/src/utils/citation-validator.ts` | Fuzzy regex check on extracted quotes vs. PDF pages |
| Brief markers | `backend/src/utils/brief-markers.ts` | Extract/splice `<!-- human:start/end -->` sections |
| Scope key | `backend/src/utils/scope-key.ts` | Stable hash of a member's folder restrictions |
| Schema | `backend/prisma/schema.prisma` | `Project.playbook`, `Project.briefManifest`, `Document.*` (verification + anomaly fields), `Task` AI fields |

## Role-based access

`ProjectMember.permissions` is a JSON blob with `restrictedFolders` / `restrictedToTags` / `canAccessKanban` / `canAccessVDR`. Enforcement lives in `documents.service.ts` (list, access), `dashboard.service.ts` (aggregations), `chat.service.ts` (retrieval scope), and `task-ai.service.ts` (attached-doc folder check). OWNER/ADMIN always have full access.

## Extraction output contract

Claude's first-pass extraction returns a JSON object whose `factSheet` field contains markdown with:

```
---
document_type: SPA|APA|LOI|...
parties, effective_date, governing_law, deal_value, risk_score (0-10)
---

# Executive Summary
# Risk Assessment  (with /10 score + top risks)
# Key Clauses (CUAD-aligned)
# Entities  (Companies, People, Monetary Amounts, Dates, Jurisdictions)
# Relationships (intra-document)
# Citations
```

Top-level fields (`documentType`, `riskScore`, `parties`, `effectiveDate`, etc.) mirror DB columns for fast filtering; the markdown is the durable, LLM-readable artifact.

CUAD-aligned clause vocabulary (41 types) and a controlled relationship vocabulary (`ACQUIRES`, `SUBSIDIARY_OF`, `PARTY_TO`, `GUARANTEES`, etc.) keep extraction consistent across documents.

## Knowledge graph — data vs. UI

The reconciliation pass emits two artifacts: the **Deal Brief** (markdown, consumed by Claude) and a **master-entity + relationship graph** (SQL, consumed by the UI). They are the same deal memory rendered for two different readers.

| Reader | Artifact | Consumer |
|---|---|---|
| Claude (Kanban AI, chat, dashboard aggregations) | Deal Brief markdown | `deal-brief.service.ts`, `task-ai.service.ts`, `chat.service.ts` |
| Humans | Master entities + relationships tables | `/projects/:id/entities` (list + dedup), `/projects/:id/graph` (Cytoscape explorer) |

Both are fed by the same Sonnet reconciliation call — no second LLM pass for visualisation. The graph explorer is read-only; edits happen through the Entity Management page (merge/split/dedup). Back-end endpoints that feed the visual graph:

- `GET /api/v1/projects/:id/master-entities` — nodes
- `GET /api/v1/projects/:id/relationships` — edges
- `GET /api/v1/projects/:id/relationships/stats` — sidebar counts

The frontend bundles these into a single `GraphData` shape in `relationships.service.ts` and renders with Cytoscape. Each endpoint caps `limit` at 100 per page; for the prototype's scale (dozens of docs → low hundreds of entities) this is a single payload.

## Out of scope for MVP

- Embedding-based retrieval (stubbed; swap later)
- Scanned PDF OCR (Claude native PDF handles digital well; image-only PDFs fail loudly)
- PDFs >100 pages (Claude native input cap; split-and-merge path can handle ~500 pages)
- Fine-tuning
- Isaacus / Voyage / OpenAI integration (not needed; `Retriever` interface is ready)

## Verification quick-start

```
cd backend
cp .env.example .env          # set ANTHROPIC_API_KEY for real Claude, or leave blank for mock mode
npm run db:local:start
npm run db:migrate
npm run dev

# in another shell
cd frontend && npm run dev
```

Upload a digital PDF in the VDR, watch it flow `Uploading → Processing → Complete`, confirm the fact sheet appears in the document detail, check the dashboard picks up the risk score, create a Kanban task with an AI prompt + attached documents, drag it to In Progress, wait for the report, open the task drawer to read it.
