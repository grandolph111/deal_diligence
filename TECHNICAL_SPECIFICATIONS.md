# DealDiligence — Technical Specifications

*What the platform is, and exactly how every part of it behaves today.*

This document is written to be read end-to-end by someone who does not build software. It describes the system as it currently works — not as it was designed, and not as it may work later. Where a number matters (how many pages, how many seconds, how accurate), the number is stated.

---

## 1. What the platform is

DealDiligence is an M&A due-diligence platform. A deal team uploads the target company's data room — contracts, financial statements, corporate records, leases, employment agreements — and the platform reads every document end to end, extracts the legally material facts, files them against the risk categories of a standard due-diligence issues report, and keeps a live picture of the deal's risk posture and open questions.

Three commitments define it:

1. **Read once, read well.** Each document is read a single time, by a model sized to the document, and turned into a structured record. Nothing is re-read to answer a question later.
2. **Organize by the deliverable.** The output is not a pile of summaries. It is filed against the risk categories of the issues report a firm actually hands its client, so *what is covered, what is thin, what is risky, and what is missing* are all visible at once.
3. **Everything is verifiable.** Every extracted fact carries a verbatim quote, a page number, and a link to its source document. Quotes are machine-checked against the source before anything is filed.

The human stays in charge of judgment. The platform does the reading, the organizing, and the remembering.

---

## 2. The vocabulary

A handful of terms recur throughout. They are worth fixing up front.

| Term | What it means |
|---|---|
| **Deal** | A single transaction workspace. Holds its documents, its risk categories, its team, and its history. Sometimes called a project. |
| **Data room** | The document store inside a deal. Where files are uploaded and browsed. |
| **Document** | One uploaded file. |
| **Fact sheet** | The structured record produced when a document is read: parties, dates, governing law, clauses, entities, risks, a risk score, and citations. |
| **Provision** | A single extracted clause instance — one clause, in one document, with its quote and page. The atom of the system. |
| **Risk category** | One of the 26 topics of the due-diligence issues report — Material Contracts, Intellectual Property, Tax Matters, and so on. The deal's only organizing axis. |
| **Coverage status** | Where a risk category stands: Open, Covered, Flagged, or Thin. |
| **Evidence** | Provisions (and risks and obligations) filed under a risk category. |
| **Finding** | A written analysis filed under a category, carrying both the AI's draft and the reviewer's version. |
| **Playbook** | The firm's house positions and red flags for this deal. Risk is scored as deviation from it. |
| **Deal brief** | The living deal-level synthesis, presented as a confidential deal memorandum. |
| **Deal report** | The due-diligence issues report: findings and requests, section by risk category. |
| **Deal map** | The visual graph of the deal: risk categories, documents, and the links between them. |

---

## 3. The shape of the system

```
   Upload  ─▶  Triage  ─▶  Queue  ─▶  Classify  ─▶  Route to a model
                                                          │
                                                          ▼
                                                       Read the
                                                       document
                                                          │
                                                          ▼
                                              Check every quote
                                              against the source
                                                          │
                                                          ▼
                                 File the clauses under their risk category
                                                          │
                                                          ▼
                                 Reconcile across the whole deal (debounced)
                                                          │
                     ┌────────────────┬───────────────────┼──────────────────┐
                     ▼                ▼                   ▼                  ▼
            Deal map   Data room    Chat + AI     Deal report    Deal memo
                       by category  Kanban tasks   & dashboard
```

Everything below the "file the clauses" step reads from the same organized library. Nothing downstream re-reads a PDF.

---

## 4. The risk categories (the spine)

The 26 risk categories are the organizing structure of the entire platform. They are **fixed configuration, not something the AI invents** — the same deal always produces the same structure, so coverage is reproducible and auditable.

They are not invented here either. They are the Topics of the **due-diligence issues report** template — the document a firm actually hands its client at the end of a review — taken verbatim and in the template's order. That matters: the deal is navigated, scoped and reported on the same axis the client eventually receives.

### 4.1 Two tiers

```
Tier 1 — Risk category    26 topics, each carrying a coverage status
   └─ Tier 2 — Evidence   the clauses found, with source, page, quote
```

There is deliberately no question tier between them. In the source template, a topic's rows are the issues *found*, not questions pre-asked, and an unanswered topic is written up as a supplemental diligence request. So coverage sits on the category itself, and a category with no evidence is the gap.

The 26 categories, in report order: **Corporate Formation & Charter · Stock Certificates & Ledgers · Corporate Records & Minutes · Officers & Directors · Management & Shareholders Agreements · Financial Records · Tax Matters · Loans & Debt Obligations · COVID-19 & PPP Loans · Real Property · Leased Property · Equipment Leases · Personal Property · Intellectual Property · Material Contracts · Government Contracts · Litigation · Lien & Judgment Searches · Regulatory Matters & Audits · Employees & Contractors · Handbooks & Employment Policies · Benefits & Labor · Employment Litigation · Environmental Matters · Data Privacy & Security · Other Issues & Red Flags.**

The last one is the template's own catch-all. Any clause type with no home lands there, so nothing extracted is ever silently dropped.

### 4.2 The clause vocabulary

When the AI reads a document, it may only label what it finds using a **fixed vocabulary of 43 clause types**. These come from CUAD — the Contract Understanding Atticus Dataset, a public set of 510 commercial contracts hand-annotated by lawyers, the closest thing the legal-AI field has to a shared answer key. We use CUAD's lawyer-defined categories and add four that CUAD never covered but that M&A diligence cannot do without: indemnification, representations & warranties, confidentiality, and payment terms.

Each of the 43 types carries a written **"present if" criterion** — the precise condition that makes it count. These criteria do real work. For example:

- *Anti-assignment* counts only when transfer is **restricted**. A clause saying the agreement binds "successors and assigns" permits assignment and is explicitly **not** this clause.
- *Uncapped liability* counts only when liability is expressly unlimited or specific claims are carved out of a cap. A clause that *limits* liability is the opposite category, and uncapped liability is never inferred from the mere absence of a cap.
- *Change of control* counts only when a right or obligation is triggered by a change in ownership — not a plain assignment clause, and not a bare definition with no operative effect.

Every clause type maps to exactly one risk category, so filing is mechanical rather than a second judgment call. Many categories — pending litigation, the cap table, environmental matters — cannot be answered by any contract clause at all; they are answered by facts, entities, and risk findings, and are marked *fact-fed*. That is precisely why the **report's categories are the spine and CUAD is only the language of the evidence**.

One consequence is worth stating plainly. Because CUAD is a contracts dataset and this axis is organized by subject matter rather than by risk function, clause evidence concentrates: measured on a 100-contract benchmark deal, **69% of it lands in Material Contracts**. That is the honest shape of a contracts-heavy data room, not a defect, and it is why the report groups a category's findings by clause type rather than presenting one long list.

### 4.3 Coverage status

Every risk category carries one of four statuses:

| Status | Meaning | How it is decided |
|---|---|---|
| **Open** | No evidence yet — an unanswered question, a gap | The default. Every item starts here. |
| **Covered** | Evidence found, consistent with the playbook | Evidence exists, nothing flagged, nothing weak |
| **Flagged** | A deviation or risk — escalate | Any high-risk provision, or a medium one that the playbook says should escalate |
| **Thin** | Evidence exists but is weak | All the evidence is low-confidence (below 75 out of 100) |

**Gaps are first-class.** The moment a deal is created, all 26 categories are seeded Open. The tracker exists before a single document does, and ingestion *closes* categories rather than creating them. A system that only describes what it found can never show you what is missing; this one opens with the missing list, and every category still open at the end is a supplemental diligence request on the report.

---

## 5. Ingest: from upload to a structured record

### 5.1 Upload

Files are uploaded directly to secure storage. Each one is registered in the deal, given a place in the data room, and queued for processing.

### 5.2 Triage — deciding what a document is worth

Before anything expensive happens, every document gets a cheap, deterministic assessment based only on signals available without reading it: its filename, its size and type, the diligence category it was filed under, and a fingerprint of its contents.

That produces three decisions:

- **Priority, P0 to P3.** P0 is critical — purchase agreements, cap tables, audited financials, quality-of-earnings reports. P1 is material — master agreements, licenses, indemnities, guarantees, credit and shareholder agreements, litigation and settlement papers. P2 is ordinary. P3 is bulk — invoices, receipts, correspondence, screenshots, scans, obvious drafts and copies.
- **Depth: full or stub.** Full means a complete clause-level read. Stub means classify and register it, without paying for a deep read.
- **Duplicate detection.** Documents are fingerprinted by content. If the identical file was already read in this deal, the copy points at the original's results instead of being read again — at no cost.

Priority determines two things: how carefully the document is read, and how soon. This is the mechanism that keeps a 10,000-document data room affordable — the analysis budget goes where being wrong is expensive.

### 5.3 The queue

Documents wait in a durable, priority-ordered queue that lives in the database, not in memory. That gives four properties:

- **Priority order** — critical documents are read before bulk ones, so the deal becomes useful within minutes even while the tail is still processing.
- **Concurrency cap** — 8 documents are read at once by default, so a bulk upload never overwhelms the rate limit.
- **Durability** — the queue survives a restart or a crash; work in flight is picked back up.
- **Multi-server safety** — two servers never claim the same document.

A job that has been running implausibly long (45 minutes by default) is treated as abandoned and retried, so nothing gets stuck forever.

### 5.4 Classification

The first two pages of each document are read cheaply and quickly to determine its type: purchase agreement (stock or asset), letter of intent, NDA, employment agreement, lease, financial, corporate, or generic. When the classifier is not confident, it deliberately answers "generic" rather than guessing — a wrong type would apply the wrong specialist reading instructions.

### 5.5 Choosing the model

The document is then routed to the right-sized model:

| Document | Read by |
|---|---|
| Up to 60 pages | The measured baseline model — the tier every accuracy number in this document was produced on |
| Over 60 pages | The premium model — long, dense agreements |

Two adjustments override the page count:

- **Priority sets a floor.** A P0 document is read at the premium tier regardless of length. A P1 document never drops below the mid tier.
- **Dense deal instruments are never read cheaply.** A short purchase agreement or letter of intent is bumped up.

There is deliberately no cheap tier below the baseline. Extraction quality *is* the product, and a short document is cheap to read well, so no tier trades measured accuracy for a few cents. The seam where a cheaper tier would slot in still exists in the design, but re-opening it requires re-running the accuracy benchmark against it first.

### 5.6 The read

The model reads the whole document — natively, as a PDF, rather than through a lossy text conversion — guided by a large instruction set: the 43 clause types with their present-if criteria, the risk rubric, the deal's playbook if one is set, type-specific guidance for the document's classified type, and worked examples.

The instructions are strict on the points that matter for a legal record:

> Every risk must cite at least one page. Every clause must include a verbatim quote. If a field is unknown, return null. Do not infer. Report a clause type only when operative language is present — absence is a valid finding.

The model is also required to **critique its own output before returning it**: does every quoted clause actually appear verbatim on the page it cites, and is every tag justified by operative language rather than adjacent language?

What comes back, for every document, is a fact sheet:

- **Basics** — document type, parties, signing and effective dates, expiration, governing law, deal value.
- **Clauses** — every material provision, tagged with one of the 43 types, with a plain-English summary, a verbatim quote, a page number, a risk level, and a calibrated confidence score.
- **Entities** — every company, person, jurisdiction, monetary amount, and key date mentioned.
- **Relationships** — how parties within the document relate to each other, using a controlled vocabulary (acquires, subsidiary of, party to, guarantees, and so on).
- **Risk** — a 0–10 score with a short explanation and the top risks, each citing a page.
- **Open questions** — anything the reader flagged as ambiguous or unresolvable.

The same shape comes out whether the input was a 3-page NDA or an 80-page credit agreement.

### 5.7 Very long documents

The constraint on a long document is not how much the model can read — it is how much it can write. A 300-page contract fits in context comfortably but cannot emit its entire clause list in one response.

So documents over 60 pages are read in **windows**: 40 pages at a time, with a 3-page overlap so a clause straddling a boundary is never lost, up to 3 windows in flight at once. The window results are then merged and de-duplicated into a single fact sheet, and duplicate findings from the overlaps are collapsed.

If any window fails, the default is to **fail the whole document loudly rather than emit a partial fact sheet**. A diligence record that silently omits forty pages is more dangerous than a failed extraction, because nothing downstream can tell "this contract has no indemnity cap" apart from "those pages were never read."

### 5.8 The bulk lane

For genuinely large data rooms there is a second, asynchronous lane that submits work in bulk. It costs 50% less and runs against a far higher throughput ceiling, but results arrive in minutes-to-hours rather than seconds.

It engages only when the backlog is large, and only for documents that are all of: **low priority (P2/P3), full depth, text-based, and small enough for a single read.** Everything material stays on the live path — a banker waiting on a purchase agreement needs progress they can watch, and no cost saving justifies a multi-hour worst case there. This is a relief valve for bulk, not a replacement pipeline.

Requests are also paced against the provider's per-minute token and request budgets, so a large ingest degrades into slower progress rather than a wall of failures.

### 5.9 Page-text caching

The parsed text of every page is cached the first time a document is opened. Every later stage — the quote checker, the verifier, windowed re-reads, re-extraction after a prompt change — reuses it instead of re-parsing.

---

## 6. Verification: proving the record

A legal tool cannot afford to invent. Verification is layered so effort is spent where it changes an outcome.

**Layer 1 — the deterministic quote check (free, always).** Every extracted quote is matched against the actual parsed text of the page it cites. This is arithmetic, not AI: it catches fabricated quotes and wrong page numbers instantly, at no cost. A quote that spans a page boundary is matched across pages rather than being wrongly flagged.

**Layer 2 — adjudicating the borderline flags (cheap, only when needed).** Fuzzy matching produces some false alarms: a faithful quote with different whitespace, an OCR artifact, a paraphrase. A fast model rules on just those flags and sorts them into fabricated, paraphrased, or actually-verbatim. Only confirmed fabrications survive to reach a human. Wrong-page flags are never sent here — those are already precise, because the checker located the exact text elsewhere.

**Layer 3 — the second read (thorough, priority documents).** A separate verification pass reads the source document alongside the fact sheet and hunts for what the mechanical check cannot see: a hallucinated quote, a wrong page, a **missed** clause, a risk level that does not match the language, an entity error. Its instructions are explicitly adversarial — *a junior analyst produced this fact sheet; your job is to find the errors; false positives are cheaper than undetected hallucinations.* It auto-corrects when the fix is unambiguous. This runs off the critical path, so a document is usable before verification finishes.

Anything unresolved is marked **needs review** and surfaced to a human. The operating philosophy is **fail loud**: surface uncertainty, never hide it.

---

## 7. Filing: turning a fact sheet into a library

Once a document is read and checked, it is decomposed and filed:

- **Every clause becomes a provision node**, filed under the risk category its clause type belongs to, carrying its quote, page, risk level, and confidence. Clause types with no mapping go to the report's catch-all category.
- **Every company and person becomes an entity node**, de-duplicated across the deal — corporate suffixes are normalized so "Acme Corporation," "Acme Corp.," and "Acme, Inc." resolve to one entity.
- **The document itself becomes a source node** — the provenance hub that holds its fact sheet.
- **Links are drawn**: evidence-to-item, evidence-to-source, evidence-to-entity, and peer links between the same clause type across different documents.
- **Touched categories flip** from Open to Covered or Flagged, with the playbook taken into account.

Two safeguards apply at this step. Negative findings — "no non-compete provision found" — are never filed as evidence, because a recorded absence must not look like a satisfied question. And re-extracting a document replaces its old provisions rather than duplicating them, so a re-read is always idempotent.

Deleting a document reverses all of it: its nodes are removed, entities left with nothing pointing at them are pruned, and coverage is recomputed. The tree stays honest as the data room changes.

---

## 8. Reconciliation: the cross-document pass

Thirty seconds after the last document in a burst settles, a reconciliation pass runs across the whole deal. The delay is deliberate — a bulk upload coalesces into one pass instead of hundreds.

Most of it is deterministic and costs nothing per run:

- **Coverage is recomputed authoritatively** for every risk category, playbook-aware, including the thin/low-confidence determination.
- **Peer links are drawn** between provisions of the same clause type appearing in two or more documents. This is what makes "show me all 101 indemnification clauses side by side" answerable instantly later.
- **Orphaned entities are pruned** and every index is rebuilt.
- **Statistical outliers are computed** directly from the structured data.

Three parts use AI, and they read the structured records rather than the PDFs:

- **Entity merge** — resolving name variants into canonical entities and identifying relationships that span documents, with a confidence floor and a requirement that a relationship appear in at least two documents before it is asserted.
- **Anomaly detection** — flagging a document that is an outlier against its peers: *"12 of 13 contracts are governed by Delaware law; this one is New York."* It requires at least three peer documents before calling anything an outlier, and is instructed not to flag deviations with an obvious deal-structure rationale.
- **Deal brief regeneration** — one brief per permission scope in use (see §12).

---

## 9. Where things are kept

The system keeps two representations of the same knowledge, on purpose:

| Form | What it holds | Who reads it |
|---|---|---|
| **Markdown documents in secure storage** | Fact sheets, the library files, deal briefs, AI risk reports | The AI, and any human who wants the durable, portable record |
| **Database** | The same facts as structured columns, plus every node and link | The application — for instant querying, sorting, counting, and permission filtering |

The markdown is the durable artifact and the audit record; the database is the index that makes it fast and safely filterable. Crucially, **downstream features read the structured data, not parsed markdown** — a fact sheet is rendered deterministically from the structured fields, so it is a projection rather than a second, drifting source of truth.

---

## 10. Asking questions

### 10.1 How the platform finds an answer

The naive approach — hand the AI every fact sheet in the deal — does not survive contact with a real data room: a few thousand documents is millions of words per question. It is also the wrong unit. A change-of-control question needs six specific provisions from four contracts, not four entire documents.

So the default retrieval walks the risk categories:

1. Build the index of risk categories that actually have evidence, with their statuses and clause types — filtered to what the asker is allowed to see.
2. Route the question to the relevant categories with a fast model.
3. Rank the candidate clauses behind those categories by semantic relevance to the question (up to 50 candidates considered per query, riskiest weighted up).
4. Return the evidence behind the selected items — capped at 12 source documents — **plus a coverage summary naming any Open items on the topic**, so the answer can say what is missing rather than only what is present.

Two other modes exist:

- **Pinned documents.** If the user has explicitly attached documents to a question or a task, that scope is honored in full — the user has already made the scoping decision.
- **Bounded fallback.** If a deal has no library evidence yet (for example, one ingested before the library existed), retrieval falls back to reading whole fact sheets — capped at 12, ordered riskiest-first, and **logged when it truncates**. An answer drawn from 12 of 900 documents that presents itself as complete is worse than one that admits its scope.

The choice between these is made from the data, not from configuration.

### 10.2 Readiness

Chat and AI tasks answer from the library, and the library is built by extraction. Before any document finishes, the categories exist but have nothing behind them — a question would route to empty categories and come back with nothing.

Rather than let that look like an answer, the platform reports a readiness state for each deal — empty, processing, partial, ready, failed, or no-access — with counts of documents complete, processing, pending, and failed, and the number of provisions filed. Chat and AI task entry points gate on it, and a partially-ingested deal is explicitly labeled as such. Mid-ingest, *"I found no change-of-control clause"* means something very different from the same sentence after ingest completes, and the interface says so. Readiness is computed within the asker's own permission scope.

### 10.3 Chat

Users ask questions in plain English and get answers with inline citations back to document and page. Conversations are saved, and titled automatically from the first message.

A good answer can be **filed back into the library as a note** — attached to the risk categories it speaks to (suggested automatically from the documents it cited, confirmed by the user) and linked to those documents. It then appears under those categories and on the deal map. A note is explicitly **not evidence**: a conclusion the team wrote must never quietly satisfy a diligence question that no document actually answers.

---

## 11. The Kanban workflow

The board is where diligence work is assigned — to people and to the AI.

- **A board belongs to one specialist**, and its scope is that member's risk-category grants, derived at read time. Re-granting categories in Admin re-scopes their boards with nothing to sync.
- **A task can carry an AI prompt and attached documents.** Dragging it into *In Progress* runs it: the premium model reads the deal brief for the user's scope plus the attached documents' evidence, and writes a risk report.
- **The report is saved for review** and opens in the task. The AI drafts; a specialist signs off. The task tracks its own AI state (queued, running, complete, failed) separately from its workflow column.
- **Ordinary project-management machinery** works alongside: assignees, tags, subtasks, comments, priorities, and due dates.

Attached documents are permission-checked at run time, so a task cannot be used to read around a restriction.

---

## 12. The two deliverables

The platform produces two documents. The **deal memorandum** is the internal executive read; the **deal report** is the issues report a client receives.

### 12.1 The deal memorandum

The brief is the deal-level synthesis, and it is deliberately half deterministic:

- **Rendered directly from the database, no AI involved:** parties, key clauses, key dates, cross-document anomalies, the document registry, and inter-document relationships. These are enumerable facts. Generating them with AI would cost tokens on every refresh and could drift; rendering them is constant work regardless of deal size.
- **Written by AI:** the snapshot, the ranked top risks, and the notes on clause patterns — the parts that require synthesis across documents rather than enumeration. The instruction is to synthesize, never to restate any single fact sheet, and to cite every claim inline.

**Human-written sections are preserved byte-for-byte** across regenerations. The AI never overwrites what a person wrote.

**One brief exists per permission scope.** A specialist restricted to two risk categories gets a brief synthesized only from documents in those categories — the deal-level view never leaks facts from behind their wall.

It is presented as a **confidential deal memorandum**: stacked US-Letter pages with letterhead, a "Re:" subject block, numbered sections (Overview, Risk Posture, Key Risks, Key Dates, Portfolio at a Glance), running heads and page footers, alongside a scroll-linked section rail. It is curated down to roughly three pages — the summary and the ranked risks. The full clause detail stays in the data room, where it belongs.

---

### 12.2 The deal report

The issues report itself: one section per risk category, in the template's order, carrying what that template asks for.

- **Legal issues and discussion items** — the flagged clauses found in that category, worst-first, each with its quote, page and source document, alongside any written findings.
- **Next steps and action items** — the Kanban tasks working that category.
- **Supplemental diligence requests** — the categories with nothing in them, collected at the end. An unanswered category is a document to request from the other side, which is exactly how the template treats it.

Flagged clauses are read live rather than copied into the report. They are already extracted, quoted and page-cited, and a copy would go stale the moment a document is re-extracted. Only the written analysis is stored, because that is the part a person has to stand behind.

**Every written finding carries two versions: the AI's draft and the reviewer's.** They sit side by side rather than one replacing the other, because the draft is the audit record of what the model actually said and the reviewer's version is what ships. Each finding shows its state, who verified it, and when.

**Approving a Kanban AI task is what files a finding.** The specialist reviews the AI's report on the task, approves it, and the write-up lands in the report under that task's risk category, attributed to them. Requesting changes retracts it: the draft has been withdrawn by its own author, and leaving it in a client-facing document would leave text standing that nobody backs.

**Export** is a single formatted PDF: letterhead, the subject and scope block, every section in order, and a running footer. It prints the reviewer's version alone, never the AI draft, and a "verified findings only" switch removes anything nobody has reviewed. That is deliberately a switch rather than a promise: a document a client may read should not carry unreviewed model text, and that has to be enforceable.

## 13. Seeing the deal

**Overview.** The deal's front page: risk posture, document counts and processing state, highest-risk documents, coverage across the risk categories, and direct actions into the rest of the app. Every number is computed within the viewer's scope.

**Data room.** Documents browsed by risk category rather than by folders. All 26 categories are listed, including the empty ones: an empty category is a gap, and hiding it would hide the finding. Each document is placed under the category it supplies the most evidence to. A pinned bucket holds documents not yet analyzed, so nothing is invisible while it waits.

**Deal map.** A visual graph of the corpus: the deal at the center, the 26 risk categories around it, and every document placed under the one category it contributes the most evidence to, with links between documents that share clause language. A 100-document deal draws as roughly 130 nodes — a readable network, not a diagram of a taxonomy. Documents are sized and colored by risk. A document usually has evidence in several categories but a node has to sit somewhere; "where does this contract mostly live" is the honest answer, and the rest stay reachable through backlinks.

**Document backlinks.** Everything the deal already knows that touches one document: which risk categories it supplies evidence to, which documents share its clause types, which entities it names. These links were computed at ingest; this is where they become visible.

**Clause comparison.** Every instance of one clause type across the entire deal, side by side, ordered worst-first — because the outlier is the point. This is the question a reviewer actually asks.

**Entities and relationships.** The canonical companies, people, and jurisdictions in the deal, with the relationships between them, and tools to merge or split entities the automatic pass got wrong.

---

## 14. Who sees what

Access is enforced on every read, not just in the interface.

**Roles.** Owner and Admin have full access to their deal. Member and Viewer hold explicit grants. Above that sit platform-level roles for the customer's own administrators and for support.

**Risk-category grants.** A restricted member is granted specific risk categories. They see the documents with evidence in those categories, a deal brief and a deal report built only from what they can see, chat answers drawn only from their documents, and **coverage statuses recomputed from in-scope evidence** — so a status can never reveal the existence of a document behind their wall. Admin is the single place access is set; boards belonging to that member re-scope from it automatically.

**Fail closed.** Folders were retired as the organizing axis, and there is no automatic mapping from a folder grant to a risk-category grant — inferring one could only over-grant. A member holding only legacy folder grants sees nothing until they are re-granted, which is the safe direction to fail.

**Audit.** Access and changes are recorded in an audit log per deal.

**Sessions.** Login issues a signed, expiring session (12 hours). Requests carry cross-site request protection and are rate-limited, with stricter limits on authentication.

---

## 15. The playbook

A deal can carry a playbook: the firm's **standard positions** (what it considers acceptable on a given clause) and its **red flags** (language it never accepts).

When a playbook is present, risk is scored as **deviation from it** rather than against a generic scale. Language matching a red flag is high risk regardless of anything else, and a clause type the playbook marks as risky-if-deviating escalates a medium finding to Flagged. Without a playbook, an absolute 0–10 rubric applies.

This is what makes the risk score a *firm's* judgment rather than a generic model's opinion.

---

## 16. How accurate it is, and how we know

Because CUAD's contracts come with lawyer-verified answers, the real pipeline can be run over them and scored honestly. The benchmark harness runs the actual production path — the same classification, routing, reading, and checking — and saves the results of every run, per document, so any change can be re-measured.

### 16.1 What each metric means

| Metric | The question it answers |
|---|---|
| **Recall** | Of the clauses the lawyers marked present, what fraction did we find? *Misses are the expensive failure in diligence.* |
| **Precision** | Of the clauses we reported, what fraction are genuinely there? *False alarms are review noise.* |
| **Grounding** | What fraction of our quotes are **not fabricated** — i.e. the text genuinely exists in the document? *The pure hallucination check.* |
| **Verbatim rate** | Stricter: what fraction match the source **word for word**? A real but slightly reformatted quote passes grounding and fails this. The gap measures transcription fidelity, not honesty. |
| **Span accuracy** | When we correctly flag a clause, does our quote overlap the passage the annotating lawyer highlighted? *Pinpoint accuracy.* |

### 16.2 Latest results — 100 contracts

Measured on 100 CUAD contracts ingested through the real pipeline, against the authoritative lawyer annotations, on the baseline model:

| Metric | Score |
|---|---|
| **Clause recall** | **82.1%** |
| **Precision (raw)** | **77.3%** |
| **Precision (corrected for gaps in the answer key)** | **~85%** |
| **Grounding — fabrication-free** | **98.6%** |
| **Verbatim rate — word-for-word** | **95.4%** |
| **Span accuracy** | **93.5%** |
| **Cost** | ~$0.26 per contract |

### 16.3 How to read those numbers honestly

**The answer key is not exhaustive.** CUAD's annotators missed real clauses. An audit of every "false positive" found that 96% of them quote genuine contract text — the model was reporting clauses that are actually in the document but that the annotators did not mark. So raw precision of 77.3% is a **floor** that assumes the answer key is perfect, and ~85% is the defensible corrected estimate. An earlier, higher corrected figure (92.3%) was retired: it was produced by an AI judge that turned out to over-credit its own family's output, which is not independent ground truth.

**Grounding is the number that matters most for trust**, and it is 98.6% — meaning under 1.5% of quotes are fabrications rather than faithful text. The 95.4% verbatim rate says that nearly all of the remaining gap is formatting drift, not invention.

**Span accuracy is a pessimistic lower bound.** The answer key marks one passage per clause category, but a clause can legitimately appear in several places; quoting a different-but-correct instance scores as a miss.

**Recall losses are diagnosed, not mysterious.** A detailed decomposition attributes the gap to specific, addressable causes: definitional confusion on categories that overlap (change of control versus assignment, post-termination services versus survival), and a handful of categories where the detection cues are weak. Fixes are applied and re-measured — one round of clause-boundary tightening moved precision from 65.6% to 80.9% while holding recall flat, and eliminated entire families of false positives.

The point is not any single number. It is that **accuracy is a measurement we manage, re-run after every change, rather than a claim we make.**

---

## 17. Capacity, speed, and cost

**Capacity.** The design target is tens of thousands of documents in a single deal. The architecture's central property is that **ongoing work stays flat as the deal grows**: asking a question, refreshing the deal picture, or opening the map costs the same on a 500-document deal as on a 50,000-document one, because those operations read the organized library rather than the documents.

The only cost that scales with deal size is the **one-time cost of reading new documents**, and that is deliberately tiered.

**Speed.** Documents are read in parallel, and critical documents are read first, so a data room becomes useful within minutes while the bulk continues to arrive. A short document takes seconds; a long agreement takes a couple of minutes because it is being read in overlapping windows and reconciled.

**Cost per document**, driven almost entirely by document length, one time:

| Document | Typical cost |
|---|---|
| Short or routine (1–5 pages) | ~$0.02–0.05 |
| Standard contract (10–30 pages) | ~$0.20–0.40 |
| Large agreement (40–80+ pages) | ~$0.40–1.00 |
| Bulk, duplicate, or stubbed | ~$0.00 |

Measured across 100 real commercial contracts, the average is **~$0.26 per contract**, of which roughly 97% is the single deep read — classification and checking are rounding errors. Across a whole data room, where most files are small, routine, or duplicates, the blended average is lower. A 10,000-document mid-market data room lands in the **low single-digit thousands of dollars, one time.**

Two mechanisms hold that down: the large instruction set is cached between calls rather than re-sent at full price, and the bulk lane runs low-priority work at half cost.

---

## 18. Security and hosting

**In production, the AI runs inside the customer's own AWS account** via Bedrock. Document content never leaves their control, and the deployment inherits AWS's SOC 2 Type 2, HIPAA, and ISO 27001 posture, with identity-based authentication (no long-lived keys to rotate) and an audit trail on every inference.

In development the platform talks to the AI provider's API directly. The same code path serves both; it is a configuration choice, not a different system.

Compliance targets are SOC 2 Type 2, US and EU AI regulation, and privacy law. Documents are stored in secure object storage with time-limited access links.

**Mock mode.** With no AI provider configured, extraction, chat, and AI tasks run against realistic placeholder output, so the entire interface and workflow can be exercised — for a demo, a test, or local development — without spending anything or sending any document anywhere.

---

## 19. Deliberate limits

Stated plainly, because a specification that only lists strengths is not a specification.

- **Scanned, image-only documents** are not currently OCR'd. Documents with a text layer are handled natively; an image-only PDF fails loudly rather than silently returning nothing.
- **Very long documents** are handled by windowing, and a document whose windows do not all succeed fails rather than producing a partial record.
- **Semantic search is a ranking layer inside the routed slice**, not a replacement for it. The risk categories do the routing; ranking orders what the routing selected.
- **The AI judge used to correct the benchmark for answer-key gaps is an AI, not a lawyer.** It produces a strict estimate, and the estimate is labeled as one everywhere it appears.
- **Notes filed from chat are conclusions, not evidence**, and are never allowed to close a diligence question on their own.
- **Coverage is only as complete as the data room.** An Open item means nobody has produced the document — which is exactly the finding the platform exists to surface.

---

## 20. In one paragraph

DealDiligence reads every document in a data room once, at a fidelity matched to how much the document matters, and turns it into a structured, quoted, page-cited record. It files every clause against the 26 risk categories of a due-diligence issues report, so the deal is always visible as coverage, flags, thin spots, and, most importantly, gaps. It checks its own quotes mechanically before filing them, re-reads the material documents adversarially, and refuses to present a partial picture as a complete one. From that library it answers questions with citations, drafts findings a specialist signs off, assembles the issues report the client eventually receives, maintains a living deal memorandum per permission scope, and draws the whole deal as a map you can trace from a headline risk down to the page it came from. Accuracy is measured against a lawyer-annotated benchmark and re-measured after every change: 82% of present clauses found, 98.6% of quotes verifiably real, ~$0.26 per contract, once.
