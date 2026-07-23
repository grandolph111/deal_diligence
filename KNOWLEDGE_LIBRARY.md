# DealDiligence.ai — The Knowledge Library

> A checklist-driven, coverage-tracked diligence knowledge base. Every uploaded
> document is exploded into atomic, clause-level **evidence** filed under a
> **due-diligence checklist**; open items are visible gaps; both humans (a graph)
> and the AI (retrieval) read the same structure; a lint pass hunts for what's
> missing. Ships behind the `LIBRARY_ENABLED` flag.

This document explains the whole system: the legal thesis, the Table of Contents,
the data model, every prompt, and a full deal lifecycle.

---

## 1. One-paragraph mental model

Today's pipeline reads a document end-to-end and writes a flat **fact sheet**.
The Knowledge Library adds a second act: it **decomposes** that fact sheet into
atomic nodes — one per clause (a *provision*), plus entities and a source node —
and **files each provision under the checklist item its clause type answers**.
The checklist is the deal's Table of Contents. Every item carries a **coverage
status** (OPEN / COVERED / FLAGGED / THIN), so an unanswered diligence question is
a first-class, visible object — not something you discover by its absence. A
debounced reconciliation pass keeps coverage, cross-document peer links, and
indexes correct. Humans navigate it as a force-directed **Deal Map**; the AI
navigates it via **ToC retrieval** (read the index → open the relevant items →
pull just that evidence). A **lint** pass reviews coverage and surfaces the
material gaps, thin areas, and risks to escalate.

---

## 2. Why this is a *legal* tool (the thesis)

The design choices are legal-domain choices, not generic AI ones:

| Legal principle | How the library embodies it |
|---|---|
| **Diligence is a checklist.** Deal lawyers work a buy-side checklist by workstream. | The **ToC *is* that checklist** (12 workstreams → ~50 items), not an ML ontology. Lawyers navigate by the questions they must answer. |
| **Diligence is about what's *missing*.** The value of a review is the open question, the un-provided document. | **Gaps are first-class.** Items are pre-seeded **OPEN** on day one; ingestion *closes* them. A CUAD/clause-driven system can only describe what's present — it can never show a gap. |
| **Clauses are the unit of legal analysis.** | The **CUAD vocabulary** (41 standardized contract-clause types) is the evidence layer. Each provision is one clause instance. |
| **Everything must be defensible.** | Every provision carries a **verbatim quote + page + source document**; a deterministic citation validator and a Sonnet verify pass guard against hallucinated quotes/pages before anything is filed. |
| **The firm has house positions.** | A per-deal **playbook** (standard positions + red flags) conditions risk: a clause that deviates from the firm's preferred position is scored higher; matches to red flags force HIGH. |
| **Counsel triages by posture.** | Coverage statuses map to triage: **OPEN** (do the work), **COVERED** (fine), **FLAGGED** (deviation/risk — escalate), **THIN** (evidence exists but is weak — verify). |
| **Ethical walls / need-to-know.** | Everything is **folder-scoped**. A reviewer restricted to certain folders sees only their documents — and their coverage is *recomputed* from in-scope evidence, so status never leaks facts from documents they can't see. |
| **Precedent & consistency across a contract set.** | **Peer links** connect the same clause type across documents; a **cross-document anomaly** pass flags outliers ("12 of 13 use Delaware; 1 uses New York"). |
| **A senior associate reviews the junior's work.** | The **lint** pass is that review: "these open items are material for this deal type; here's what to request." |

---

## 3. The Table of Contents (in detail)

The ToC is a **fixed, canonical buy-side M&A diligence checklist** — deterministic
config in [`checklist.ts`](backend/src/integrations/library/checklist.ts), *not*
LLM-generated. That determinism is deliberate: the same deal always produces the
same tree, and coverage is reproducible and auditable.

### Three tiers

```
Tier 1  Workstream        12 legal/diligence categories (Corporate, IP, Liability, …)
Tier 2  Checklist item    ~50 diligence questions — each a pre-seeded slot with a coverage status
Tier 3  Evidence node     CUAD clause instances (+ risk/date/obligation) filed under the item they answer
```

Plus **cross-cutting node types** that thread through the tree:
- **Source** — one node per ingested document (provenance hub; holds the fact sheet).
- **Entity** — canonical companies / people / jurisdictions (deduped; org names are suffix-normalized so "Acme Corporation" and "Acme Corp." are one node).
- **Risk** — an identified risk (a risk register view).

### The 12 workstreams and the CUAD → item mapping

Every one of the 41 CUAD clause types maps to exactly one item (bracketed).
Items **without** brackets are *fact-fed* — answered by facts, entities, and risk
findings, which a clause-only system can never populate (litigation, tax, cap
table, environmental). That's the tell that the checklist, not CUAD, must be the spine.

| Workstream | Checklist items (CUAD types filed under them) |
|---|---|
| **01 Corporate & Org** | Entity formation · Cap table & ownership · Subsidiaries · Governance & voting · **CoC / assignment triggers** `[CHANGE_OF_CONTROL, ANTI_ASSIGNMENT]` · Minority/third-party rights `[THIRD_PARTY_BENEFICIARY, ROFR_ROFO_ROFN]` |
| **02 Financial** | Financial statements / QoE · Indebtedness & liens · **Payment terms** `[PAYMENT_TERMS]` · Liquidated damages `[LIQUIDATED_DAMAGES]` · Revenue/profit sharing `[REVENUE_OR_PROFIT_SHARING]` |
| **03 Commercial Contracts** | Material customer / supplier agreements · **Exclusivity & MFN** `[EXCLUSIVITY, MOST_FAVORED_NATION]` · Minimum/volume `[MINIMUM_COMMITMENT, VOLUME_RESTRICTION]` · Pricing `[PRICE_RESTRICTIONS]` · Termination & renewal `[TERMINATION_FOR_CONVENIENCE, RENEWAL_TERM, NOTICE_PERIOD_TO_TERMINATE_RENEWAL]` · Post-termination `[POST_TERMINATION_SERVICES]` |
| **04 Intellectual Property** | IP ownership `[IP_OWNERSHIP_ASSIGNMENT, JOINT_IP_OWNERSHIP]` · Licenses `[LICENSE_GRANT, IRREVOCABLE_OR_PERPETUAL_LICENSE, NON_TRANSFERABLE_LICENSE, UNLIMITED_LICENSE]` · Source-code escrow `[SOURCE_CODE_ESCROW]` · Open-source · IP litigation |
| **05 Liability & Risk** | **Liability caps** `[CAP_ON_LIABILITY, UNCAPPED_LIABILITY]` · Indemnification `[INDEMNIFICATION]` · Reps & warranties `[REPRESENTATIONS_AND_WARRANTIES, WARRANTY_DURATION]` · Insurance `[INSURANCE]` |
| **06 Employment & Benefits** | Key employees · Employment agreements · Restrictive covenants `[NON_COMPETE, NO_SOLICIT_EMPLOYEES, NO_SOLICIT_CUSTOMERS, NON_DISPARAGEMENT, COMPETITIVE_RESTRICTION_EXCEPTION]` · Benefit plans / ERISA · Labor classification |
| **07 Real Property** | Owned property · Leases · Environmental |
| **08 Regulatory & Compliance** | **Governing law** `[GOVERNING_LAW]` · Licenses & permits · Audit rights `[AUDIT_RIGHTS]` · Anti-corruption/sanctions · Antitrust / HSR |
| **09 Data & Privacy** | Confidentiality `[CONFIDENTIALITY]` · Data-protection compliance · Security incidents |
| **10 Litigation & Disputes** | Pending litigation · Settlements & covenants not to sue `[COVENANT_NOT_TO_SUE]` · Governmental investigations |
| **11 Tax** | Tax returns & liabilities · Tax structure & attributes |
| **12 Term & Key Dates** | Signing/effective/expiration `[AGREEMENT_DATE, EFFECTIVE_DATE, EXPIRATION_DATE]` · Milestones & deadlines |
| *(99 To-Triage)* | Catch-all `unmapped-provisions` — any clause type without a mapping lands here; hidden from the graph until something arrives, so it never inflates "open questions." |

### Coverage status (the diligence tracker)

| Status | Meaning | How it's computed |
|---|---|---|
| **OPEN** | No evidence yet — an unanswered question / gap | pre-seeded; the default |
| **COVERED** | Evidence found, consistent with the playbook | evidence exists, not flagged, not thin |
| **FLAGGED** | Deviation or risk — escalate | any HIGH-risk provision, **or** the playbook escalates a MEDIUM provision whose clause type is `riskIfDeviates: HIGH` |
| **THIN** | Evidence exists but is weak | has evidence, but all of it is low-confidence (<75) |

Status is recomputed **authoritatively** during reconciliation and **per-scope at
read time** (a restricted reviewer's coverage reflects only their documents).

---

## 4. Architecture

### Where it sits

The library is **Stage 7** of the existing ingestion pipeline — additive, and
behind `LIBRARY_ENABLED`. Nothing upstream changes.

```
Upload → classify → route model → extract → citation-validate → verify → factSheet.md   (existing)
                                                                              │
                                                                              ▼
                                                    Stage 7: file into the library  (new)
                                                                              │
                                                                              ▼
                                                    debounced reconciliation (30s)  (extended)
```

### Data model

Markdown-in-S3 is the durable, LLM-readable artifact; a SQL mirror gives the UI,
RBAC scoping, and dashboards fast queries — the same "markdown is truth, SQL
mirrors for filtering" pattern the rest of the app uses.

| Table / field | Role |
|---|---|
| `LibraryNode` | Every node: `type` (CHECKLIST_ITEM / PROVISION / RISK / OBLIGATION / ENTITY / SOURCE), `workstreamId`, `itemId`, `slug`, `title`, `s3Key`, `status`, `clauseType`, `riskLevel`, `confidence`, `pageNumber`, `sourceDocumentId`, `masterEntityId` |
| `LibraryEdge` | Directed edges: `EVIDENCES` (provision→item), `SOURCED_FROM` (→source), `MENTIONS` (→entity), `PEER_OF` (same clause type across docs) |
| `Project.libraryManifest` | JSON pointers: the master index, the lint report, seed timestamp |

S3 layout (per project): `library/CLAUDE.md · index.md · checklist.md · log.md ·
lint.md · workstreams/<ws>/<item>/_index.md + <provision>.md · sources/ · entities/`.

### Model tiering

| Stage | Model | Why |
|---|---|---|
| Classify (first 2 pages) | Haiku | cheap routing |
| Extract (per doc) | Haiku / Sonnet / **Opus** (routed by page count + type) | the one place subtle risk must be caught |
| Verify | Sonnet | reads the PDF alongside the fact sheet |
| Reconciliation (entity merge, anomaly, deal brief) | Sonnet | reads markdown, not PDFs |
| **ToC routing** (chat/Kanban retrieval) | **Haiku** | fast "read the index" step |
| **Lint** (gap-hunting) | **Sonnet** | judgment over the full coverage state |

---

## 5. The prompts

The ToC tree itself is **code, not a prompt**. What the prompts do is (a) produce
the CUAD-typed provisions that fill it, and (b) operate over it (route, lint,
synthesize). Filing is deterministic (`clauseType → item` map).

### 5.1 Extraction — the source of every provision

A ~4k-token cached system prompt ([`prompts/extraction/shared.ts`](backend/src/integrations/claude/prompts/extraction/shared.ts))
composed as `SHARED_PREAMBLE + FEW_SHOT + TYPE_BLOCK + PLAYBOOK_BLOCK`. Its
disciplines are what make the evidence defensible:

> *"You are a senior M&A diligence analyst… Every risk MUST cite at least one
> page. Every clause MUST include a verbatim quote. If a field is unknown, return
> null. Do not infer. Use only the CUAD clause types and controlled relationship
> vocabulary below."*

It enumerates the **41 CUAD clause types with a "present-if" criterion** each,
the **risk rubric** (playbook-relative when a playbook exists, else an absolute
0–10 scale), a **mandatory self-critique** ("Does every clause's content appear
verbatim on its cited page?"), a calibrated **confidence score**, and the exact
**fact-sheet markdown template**. The playbook block injects the firm's positions:

> *"If a `<playbook>` block appears, risk = deviation from the playbook's preferred
> positions. Clause language matches any item in `redFlags`: HIGH risk, regardless
> of other factors."*

### 5.2 Classify (Haiku) — routes to a type-specific extraction

Legal document classifier over the first 2 pages → one of SPA / APA / LOI / NDA /
EMPLOYMENT / LEASE / FINANCIAL / CORPORATE / GENERIC, with confidence calibration
("prefer GENERIC when uncertain").

### 5.3 Verify (Sonnet) — the quality gate before filing

> *"You are a senior M&A diligence verifier. A junior analyst produced the fact
> sheet… Your job: find errors."* Checks **HALLUCINATED_QUOTE** (every quote must
> appear verbatim in the PDF), **WRONG_PAGE**, **MISSING_CLAUSE**, **RISK_MISMATCH**,
> **ENTITY_ERROR**; auto-corrects when safe. *"Be strict. False positives are
> cheaper than undetected hallucinations."*

### 5.4 Reconciliation & anomaly (Sonnet) — cross-document

Entity merge (*"'Acme Corp', 'Acme Corporation', 'Acme, Inc.' are one canonical
entity"*), a controlled relationship vocabulary (`SUPERSEDES`, `ADVISOR_TO`,
`GUARANTEES`, …, ≥2-doc threshold, confidence <0.7 dropped), and outlier detection
(*"Require ≥3 peer documents… flag when a value is ≥2 SD from the peer median…
'12 of 13 use Delaware, 1 uses New York'… Do not flag deviations with obvious
deal-structure rationale."*).

### 5.5 Deal Brief (Sonnet) — the living synthesis

Produces one markdown brief per folder-scope with AI-regenerated sections and
byte-preserved human sections (`<!-- human:start -->`). *"Synthesize across
documents. Do NOT restate any single fact sheet. Cite inline `[DocName p.N]`. Top
Risks = the 5 most material, each citing a document and page."* Sections: Snapshot,
Parties, Key Clauses, Top Risks, Key Dates, Anomalies, Document Registry,
Inter-document Relationships. This is the primary high-level context for chat/tasks.

### 5.6 ToC router (Haiku) — "read the index, follow the links"

[`route.ts`](backend/src/integrations/claude/route.ts). Given the compact checklist
index and a question, returns the relevant item ids:

> *"You route a due-diligence question to the relevant checklist items… each item
> is a question with a coverage status (OPEN = no evidence yet, COVERED, FLAGGED =
> risk/deviation, THIN = partial) and the clause types filed under it. Return ONLY
> the ids relevant to the question… Include an item even if OPEN when the question
> is about that topic (an open item is a gap worth surfacing)."*

### 5.7 Lint (Sonnet) — the gap-hunter

[`lint.ts`](backend/src/integrations/claude/lint.ts). Reads scoped coverage +
document registry + playbook, returns prioritized findings:

> *"You are a senior M&A diligence lead reviewing coverage… Focus on judgment a
> mechanical check can't provide: **GAP** — an OPEN item that is material for this
> deal (not every open item — the ones that matter); say why, and what document
> would close it. **THIN**, **RISK** (flagged, escalate), **INCONSISTENCY**,
> **SUGGESTION** (a document to request). Never invent facts or documents."*

---

## 6. Deal lifecycle — every piece, in order

### ① Project created → library seeded
On project create, `seedProjectLibrary` writes the **entire checklist as OPEN
nodes** + the index/log spine. The deal opens with ~50 visible unanswered
questions — the diligence tracker exists before a single document does. The team
optionally sets a **playbook** (standard positions + red flags).

### ② Documents uploaded → extraction
Each upload (presigned S3) fires the pipeline: **classify** → **model router**
(Haiku/Sonnet/Opus by size + type) → **extract** (native PDF + type-specific
prompt + playbook, forced tool call) → **citation regex validator** (fuzzy-match
every quote against the PDF) → **Sonnet verify** (auto-correct on CRITICAL) →
`factSheet.md` in S3.

### ③ Stage 7 → filing
`fileDocument` decomposes the extraction:
- each **clause → a PROVISION node**, filed under `itemForClauseType(clauseType)` (deterministic), with its quote, page, risk, confidence;
- each company/person → a deduped **ENTITY node**;
- the document → a **SOURCE node** (holds the fact sheet);
- edges: `EVIDENCES` (→item), `SOURCED_FROM` (→source), `MENTIONS` (→entity);
- touched items flip **OPEN → COVERED / FLAGGED** (provisional, playbook-aware).

### ④ Debounced reconciliation (30s after the last doc settles)
Deterministic, no LLM: recompute **authoritative coverage** (playbook-aware, adds
THIN), draw **PEER_OF** links between same-clause-type provisions across ≥2 docs,
prune orphaned entities, and rebuild all indexes + the log. In the same pass (LLM):
**entity merge**, **cross-document anomaly** detection, and the **Deal Brief**
(re)generation per folder-scope.

### ⑤ Humans read it → the Deal Map
A force-directed **graph tab**: workstream hubs → checklist items (colored by
coverage) → sources + entities. Isolated gray nodes are OPEN gaps; red are FLAGGED;
click an item to splice in its provision evidence (peers linked). A coverage bar
shows Open / Covered / Flagged / Partial at a glance.

### ⑥ The AI reads it → ToC retrieval
When a user asks chat a question (or a Kanban AI task runs) and hasn't pinned
specific documents, `libraryTocRetriever` **routes the question to the relevant
checklist items** (Haiku), then returns **only the fact sheets of the documents
behind those items** — plus a synthetic *"Diligence coverage"* block naming any
OPEN items, so the answer surfaces gaps. Folder-scoped at query time. This replaces
"stuff every fact sheet" with "walk the checklist" — cheaper and more precise, with
correct citations. The Deal Brief remains the high-level context.

### ⑦ Gap-hunting → lint
On demand ("Findings" on the Deal Map), the **lint** pass reviews scoped coverage
+ registry + playbook and returns prioritized findings — the material GAPs (with
what to request), THIN areas, FLAGGED risks to escalate, and inconsistencies. Each
finding links back to its checklist item in the graph.

### ⑧ Documents change → self-healing
Delete a document → its library nodes are removed, orphaned entities pruned, and
coverage reconciled. Re-extract a document → its old provisions are replaced
idempotently. The tree stays honest as the data room evolves.

```
create ─▶ seed OPEN tree ─▶ [upload ─▶ extract ─▶ file ─▶ reconcile] ⟳ ─▶ Deal Map / chat / lint
   │            │                                    │
 playbook   ~50 gaps                          coverage closes,
                                              gaps shrink, flags surface
```

---

## 7. Scope, RBAC & compliance

Folder scope is resolved once (`resolveProjectScope`) and enforced at **every
read**: the Deal Map, ToC retrieval, and lint all filter sources/provisions/
entities to the caller's `allowedFolderIds`, and **recompute coverage status from
in-scope evidence** — so a restricted reviewer never sees a status driven by
documents behind their ethical wall. Prod hosting targets AWS Bedrock (data stays
in the customer's account; SOC 2 / HIPAA / ISO inherited; CloudTrail audit).

---

## 8. Key files

| Area | Path |
|---|---|
| Canonical checklist + CUAD→item map | `backend/src/integrations/library/checklist.ts` |
| Library operating manual + checklist render | `backend/src/integrations/library/templates.ts` |
| Filing + seeding + reconciliation (Stage 7 / Phase 2) | `backend/src/services/library-writer.service.ts` |
| Graph read API (scoped, tiered) | `backend/src/modules/library/library.service.ts` |
| ToC retriever (Phase 3) | `backend/src/integrations/retrieval/libraryTocRetriever.ts` |
| ToC router prompt (Haiku) | `backend/src/integrations/claude/route.ts` |
| Lint service + prompt (Phase 4) | `backend/src/services/library-lint.service.ts`, `backend/src/integrations/claude/lint.ts` |
| Extraction prompt (source of provisions) | `backend/src/integrations/claude/prompts/extraction/shared.ts` |
| Deal Map UI | `frontend/src/features/library/`, `frontend/src/pages/LibraryGraphPage.tsx` |
| Schema | `backend/prisma/schema.prisma` (`LibraryNode`, `LibraryEdge`, `Project.libraryManifest`) |

---

*Ships behind `LIBRARY_ENABLED=true`. Extraction/classify/verify/reconcile are the
existing pipeline; Stage 7, the Deal Map, ToC retrieval, and lint are the library.*
