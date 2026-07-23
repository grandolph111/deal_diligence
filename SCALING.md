# Scaling to Enterprise VDR Volume

> How DealDiligence.ai goes from the MVP's "dozens of documents per deal" to the
> real target: **tens of thousands of PDFs in a single data room.** The
> foundation — the checklist-driven Knowledge Library — is already the right one;
> this doc is the engineering program that removes the MVP's "stuff everything
> into Claude" shortcuts and adds priority-tiered ingestion, hybrid retrieval, and
> statistical analysis.

See [KNOWLEDGE_LIBRARY.md](KNOWLEDGE_LIBRARY.md) for the library itself and
[ARCHITECTURE.md](ARCHITECTURE.md) for the base pipeline.

---

## 1. The target

Real M&A data-room volumes by target-company size:

| Market | Revenue | Documents |
|---|---|---|
| Small | < $10M | 150 – 500 |
| Mid | $10M – $100M | 5,000 – 12,000 |
| Large | > $100M | 20,000 – 100,000+ |

Distribution is dominated by two folders that are also the highest diligence
value: **3.0 Material Agreements** (up to ~40K) and **2.0 Financial & Tax** (up to
~25K). The VDR folder taxonomy maps ~1:1 onto the library's 12 workstreams, so the
folder a document lives in is a strong prior for *both* where it files and how much
it matters.

**Current ceiling:** ~dozens comfortably, low hundreds with a tier bump. **Target:**
tens of thousands per deal.

---

## 2. Principles

1. **Never operate on the whole corpus.** The checklist ToC is a structural index —
   every query and analysis narrows to a bounded slice ("the indemnification
   provisions"), never all 100K docs.
2. **Priority = fidelity, not just order.** Deep-extract the material tail; cheaply
   stub the bulk; extract the rest lazily, only when a question needs it.
3. **LLM only where judgment is required.** Use vectors for ranking, SQL/statistics
   for outliers, deterministic rules for dedup and blocking. Reserve Claude for the
   reads and syntheses that actually need reasoning.
4. **Incremental everything.** No full-corpus recompute on each upload.

---

## 3. What breaks today, and the fix

| Piece | Breaks at scale because | Fix (section) |
|---|---|---|
| Ingestion | Fire-and-forget `setTimeout`; no durability, ordering, or backpressure | Durable priority queue (§5) |
| Extraction cost/time | Every doc at full Opus/Sonnet fidelity = $$$ + days | Priority tiering + lazy extraction (§4) |
| Retrieval (chat/tasks) | ToC route caps at 12 docs — lossy when an item has 800 | Hybrid: checklist route → vector rank (§7) |
| Deal Brief / entity-merge / anomaly | Stuff *all* fact sheets into one call — 30M tokens at 10K docs | Map-reduce brief, statistical anomaly, entity blocking (§8) |
| Deal Map graph | Cytoscape can't render 10K+ nodes | Server aggregation + drill-down (§9) |
| Reconciliation | O(corpus) recompute per upload | Incremental (§9) |

---

## 4. Priority-tiered & lazy extraction — the core lever

At 100K docs you cannot deep-extract everything: that's ~$25K and days of model
time, most of it spent on invoices and boilerplate. Make **priority decide how
deeply and expensively each document is read.**

| Tier | What lands here | Extraction | Queue |
|---|---|---|---|
| **P0 Critical** | Deal instruments (SPA/APA/LOI), material agreements w/ CoC, financial statements, cap table | **Opus** — full CUAD + Sonnet verify | Front, immediate |
| **P1 High** | Other material contracts, exec employment/retention, IP assignments, active litigation | **Sonnet** — full CUAD + verify | Next |
| **P2 Standard** | Routine contracts, standard HR, permits, leases | Sonnet/Haiku — full CUAD, light/no verify | Batched |
| **P3 Bulk** | Invoices, boilerplate NDAs, routine correspondence, near-duplicates | **Haiku classify + cheap embedding/summary stub only** — full CUAD *deferred* | Lazy |

**The P3 lazy path is what makes 100K tractable.** Bulk docs are classified and
indexed for retrieval (findable) but not fully clause-extracted until something
needs them. You eagerly deep-extract ~5–15% (the material tail) and stub the rest.

### Assigning priority is cheap (no deep read)
A lightweight **triage pass** scores every doc from signals available *before*
extraction:
- **Folder** (free) — the strongest prior (3.0/2.0 → high; 4.0/6.0 → mostly routine).
- **Filename** (free) — `SPA_Executed_Final.pdf` vs `Invoice_4471.pdf`.
- **First-2-page classify** — the existing Haiku classifier, extended to emit
  `priority` + `priorityReason` alongside document type.
- **Deal type + playbook** — a stock deal weights corporate/cap-table; a red-flag
  clause type bumps priority.

Priority is **overridable** (a reviewer pins a doc up) and **re-derivable** (a new
deal type or playbook re-triages the corpus).

### Gap-driven extraction (priority × the library)
Wire the lint pass to the deferred queue: when a *material* checklist item is OPEN,
lint knows which stubbed P3 docs sit in the relevant folder and can trigger their
full extraction to close the gap. **You pay to deeply read a document exactly when a
diligence question needs it** — not before.

### De-duplication
VDRs are full of near-duplicates (versions, copies across folders). A content-hash +
near-dup check *before* extraction avoids extracting the same MSA five times — 20–40%
savings at 100K docs, plus cleaner entity/peer data. Store a `contentHash`; route
exact/near dups to a single canonical extraction and link the copies.

---

## 5. Durable priority queue

Replace the in-process fire-and-forget with a real queue (BullMQ/Redis or SQS) +
worker pool:
- **Ordered by priority** (P0 first), resumable across restarts.
- **Token-budget rate limiter** — respect the Anthropic per-minute input-token
  budget across all concurrent workers (the current single-call 429 retry isn't
  enough when 50 workers run).
- **Backpressure + retry with durable state** (not `setTimeout`).
- Extraction of a 100K-doc deal becomes a batch job over hours-to-days, observable
  and pausable.

---

## 6. Layered playbook (company + project)

Firms have a *house* diligence posture that's the same across every deal, plus
*deal-specific* positions. Model both, and inject both into ingestion.

| Layer | Format | Scope | Role |
|---|---|---|---|
| **Company playbook** | **Markdown** (freeform house philosophy) | Set once per company | Prose + judgment: "conservative buyer; flag CoC triggering < 50% transfer; uncapped indemnity is a red flag; IP chain-of-title is paramount." |
| **Project playbook** | Structured JSON (`standardPositions` + `redFlags`) | Per deal | Exact deviation scoring: preferred clause language, fallbacks, `riskIfDeviates`, hard red flags. |

**Composition into the ingestion prompt:** `SHARED_PREAMBLE + FEW_SHOT + TYPE_BLOCK
+ COMPANY_PLAYBOOK_MD + PROJECT_PLAYBOOK_BLOCK`. Precedence: company (general) →
project (specific) → red flags force HIGH.

**Why it matters at scale:** the company markdown is *identical across all of a
company's extractions*, so it's a perfect **prompt-cache** block — a 90% cache-read
discount on every one of tens of thousands of extractions. Concise is key (target a
few hundred–~1.5K tokens); it inflates every call otherwise.

The company playbook should also flow into **lint** (gap-hunting should reflect firm
priorities), the **deal brief**, and **risk reports** — firm posture is relevant
everywhere Claude reasons about the deal.

*Status: `Company.playbook` exists in the schema but is currently never injected
into extraction. This adds a `Company.playbookMarkdown` field (or S3 pointer),
renders it as a cached prompt block, and wires it through the runners.*

---

## 7. Hybrid retrieval (structural + semantic)

The library's ToC route is the structural filter; vector search is the ranker.

```
question ─▶ checklist route (Haiku)  ─▶ relevant items (bounded slice)
          ─▶ vector search within those items' provisions (pgvector / Voyage / Isaacus)
          ─▶ top-K provisions (ranked, cited) ─▶ answer
```

- Embed each **provision** (clause quote + summary) — atomic, typed units, so the
  vector search runs *within* "indemnification provisions," not the whole corpus.
  That makes it far more precise than naive RAG over raw pages.
- `pgvector` with HNSW handles millions of vectors; **Isaacus** is legal-domain
  embeddings (there's a tech brief in `handover/`), a strong upgrade over generic.
- Slots behind the existing `Retriever` interface as `PgVectorRetriever` — no caller
  changes. Retrieval cost/latency becomes **independent of corpus size.**

---

## 8. Reconciliation at scale

Move the three "stuff everything" LLM passes to structured-first:

- **Entity resolution.** Deterministic **blocking** first (normalized name + type +
  the existing Levenshtein dedup) to collapse tens of thousands of mentions into
  candidate clusters; LLM only on the *ambiguous tail*. Never one giant merge call.
- **Anomaly detection.** This is *statistics*, not reasoning: compute per-clause-type
  distributions (numeric SD, categorical frequency) in SQL over the extracted
  structured fields, flag outliers deterministically, then LLM only to *explain* the
  top flagged ones.
- **Deal Brief.** Map-reduce: summarize per workstream/item from the **top-K
  evidence** (vector-ranked), then a synthesis pass over those summaries. Already
  per-scope; make it per-workstream too. Never all 10K fact sheets at once.
- **Incremental.** A new upload touches only its items/entities — recompute affected
  coverage, peer links, and entity clusters, not the whole graph.

---

## 9. Graph at scale

The Deal Map becomes drill-down, not show-everything:
- Base view = workstreams → items (coverage) → **aggregated** sources/entities
  (counts + top-risk, not 10K nodes).
- Expand loads a **paged, ranked** slice (server-side).
- WebGL renderer (Sigma.js) if a slice still exceeds a few thousand nodes.

---

## 10. Schema & infra deltas (concrete)

| Change | Where |
|---|---|
| `Document.priority` (P0–P3), `priorityReason`, `extractionDepth` (`full`\|`stub`), `contentHash` | `prisma/schema.prisma` |
| Priority triage pass (folder/filename rules + extended Haiku classify) | new `triage.service.ts` before extraction |
| Durable queue + worker pool + token-budget limiter | new `queue/` (BullMQ/SQS) |
| Provision embeddings + `pgvector` index; `PgVectorRetriever` | `retrieval/`, DB extension |
| `Company.playbookMarkdown` + `COMPANY_PLAYBOOK_MD` prompt block | schema, `prompts/extraction`, runners |
| Statistical anomaly (SQL) + entity blocking | `reconciliation.service.ts` |
| Map-reduce brief (per workstream) | `deal-brief.service.ts` |
| Aggregated graph API + paging | `library.service.ts` |

---

## 11. Capacity & cost at 100K docs

- **Extraction** (one-time): with priority tiering + dedup, deep-extract ~10–15K of
  100K (the material tail) → roughly **$3K–$8K** and hours-to-days on a durable
  queue, vs. ~$25K+ and days if you extracted everything.
- **Storage**: S3 (infinite) + ~100–300K provision rows/vectors — trivial for
  Postgres + pgvector/HNSW.
- **Per-query** (chat/lint/graph): **independent of corpus size** once retrieval is
  vector-backed and the brief is map-reduced.
- Binding constraints become the boring, linear ones: extraction throughput/cost and
  vector-index build — both parallelizable.

---

## 12. Rollout sequencing

| Phase | Delivers | Moves ceiling to |
|---|---|---|
| **A** | Durable priority queue + triage (priority + dedup) + tiered/lazy extraction | thousands |
| **B** | `pgvector` hybrid retrieval (`PgVectorRetriever`) | thousands, precise |
| **C** | Statistical anomaly + entity blocking + map-reduce deal brief | tens of thousands |
| **D** | Aggregated/drill-down graph + incremental reconciliation | tens of thousands, smooth |

**The layered playbook (company markdown + project structured, §6) is small and
high-value — land it anytime; it improves quality at every scale and its cache
savings compound as volume grows.**

---

*The through-line: the checklist Knowledge Library is the index that makes all of
this tractable. Priority decides depth, vectors decide relevance, statistics decide
outliers, and Claude is reserved for judgment — so no stage ever depends on reading
the whole data room at once.*
