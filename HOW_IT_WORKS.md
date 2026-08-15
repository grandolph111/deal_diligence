# DealDiligence.ai — How It Works

*A plain-English overview of the platform, walking through a full deal.*

---

## The one-paragraph version

DealDiligence.ai is an AI platform for M&A due diligence. When a deal team uploads a virtual data room — often thousands of contracts, financials, and corporate documents — the platform has Claude (Anthropic's AI) **read every document end to end**, pull out the legally important facts (parties, clauses, risks, dates, entities), and organize them into a living, **checklist-driven knowledge library**. From that library, the team gets a deal-level risk picture, can ask questions in plain English, can assign AI to draft risk reports, and can see how every document and party connects — all filtered to what each user is allowed to see. In short: **it turns a mountain of unread documents into a structured, queryable, verifiable picture of the deal.**

## The problem we're solving

Due diligence today is manual. Junior lawyers and bankers read thousands of documents by hand, hunting for the same ~40 categories of risky clauses — change of control, indemnification caps, exclusivity, assignment restrictions, and so on. It's slow, expensive, inconsistent between reviewers, and things get missed. On a $100M deal, a single missed clause can be a very expensive mistake.

Our approach: an AI that reads like a senior analyst, never gets tired, **cites its source for every fact**, and organizes everything against a standard diligence checklist — with a human always in the loop for the high-stakes calls.

## The three ideas that make it work

1. **Read once, well.** Every document is read a single time by the right-sized AI model, producing a structured "fact sheet." We never pay to re-read.
2. **Organize by the diligence checklist.** The output isn't a pile of summaries — it's filed against a due-diligence checklist, so *what's covered, what's missing, and what's flagged* are all visible at a glance.
3. **Everything is verifiable.** Every extracted fact points to the exact page and quote in the source document. Nothing is taken on faith.

---

## Walking through a full deal

Here's what happens from the moment a data room is uploaded to the moment the team is working the deal.

### Stage 1 — The data room lands
The deal team uploads their documents into the Virtual Data Room (VDR). This can be a handful of files or tens of thousands — NDAs, purchase agreements, employment contracts, leases, financials, corporate records. Each file is stored securely and queued for processing.

### Stage 2 — Triage: decide what matters most
Not every document deserves the same attention. A master purchase agreement matters far more than a routine invoice. So each document is **triaged into a priority** — from *critical* (the SPA, financials, key contracts) down to *routine* (bulk correspondence, duplicates). The system also **de-duplicates** — if the same document was uploaded twice, we don't pay to read it again.

This priority decides two things: how carefully the document is read, and how quickly. Critical documents jump the queue and are read at the highest fidelity; routine ones are handled cheaply. This is how the platform stays affordable at tens of thousands of documents — you spend the analysis budget where being wrong is costly.

### Stage 3 — Extraction: the AI reads the document
Each document is read by Claude. The system picks the **right-sized AI model** automatically — a fast, cheap model for a short routine doc; a more powerful model for a long, complex agreement. Claude reads the whole document and produces a structured **fact sheet**:

- **Parties, dates, governing law, deal value** — the basic facts.
- **Clauses** — every important legal clause, tagged by type (the ~40 standard diligence categories), with a plain-English summary, a **verbatim quote**, the **page number**, and a **risk level**.
- **Entities** — every company, person, and jurisdiction mentioned.
- **A risk score (0–10)** and a short summary of why.

The result is a clean, consistent record for every document — the same shape whether it's a 3-page NDA or an 80-page credit agreement.

### Stage 4 — Verification: is it right?
Because a legal tool can't afford to make things up, every extraction is checked — but *smartly*, spending effort where it matters:

1. **A free, automatic check** confirms that every quoted clause actually appears, word-for-word, on the page it claims. This catches fabricated or misremembered quotes instantly, at no cost.
2. **A quick AI second-look** cleans up the borderline cases (is this a real problem, or just a faithful paraphrase?).
3. **A deeper AI review** runs only on the *high-priority* documents — the ones where a missed clause or mis-rated risk would actually hurt — to catch omissions and judgment errors the automatic check can't see.

Anything the checks can't resolve is flagged **"needs review"** so a human looks at it. The philosophy is **fail loud**: surface uncertainty, never hide it.

### Stage 5 — Filing into the knowledge library
This is what makes the platform more than a document reader. Every extracted fact is **filed against a due-diligence checklist** — organized into workstreams (Corporate, Financial, Commercial Contracts, IP, Liability, Employment, and so on), each with the specific items a diligence team looks for.

As documents come in, each checklist item lights up with a status:
- **Covered** — we found solid evidence.
- **Flagged** — we found something risky that needs attention.
- **Thin** — we found something, but it looks incomplete.
- **Open** — nobody has produced this yet (a **gap**).

That last one is the quiet superpower: the library tells you **what's *missing*** — the documents you should be asking the other side for — not just what's present.

### Stage 6 — Connecting the dots
Once a batch of documents is in, the platform runs a **reconciliation** pass that works across the whole deal:
- **Merges entities** — recognizes that "Acme Corp.", "Acme Corporation", and "Acme" are the same company.
- **Finds anomalies** — e.g., "12 of 13 contracts are governed by Delaware law; this one is New York," or "this indemnity is unusually risky versus its peers."
- **Builds a deal-level picture** — a concise brief and a visual **deal map** showing how documents, clauses, and parties connect.

All of this is done with fast, deterministic logic (not repeated expensive AI calls), so it stays cheap no matter how large the deal grows.

### Stage 7 — Working the deal
Now the team actually uses it:
- **Ask questions in plain English** ("What are the change-of-control risks?") and get answers drawn from the relevant documents, with citations.
- **Assign AI tasks** on a Kanban board — attach documents to a task, and Claude drafts a risk report for a specialist to review.
- **Read the deal brief** — a one-page, always-current summary of the deal's risk posture.
- **Explore the deal map** — a visual graph of the whole deal.

Everything a user sees is **filtered to their permissions** — a reviewer restricted to certain folders only ever sees documents, answers, and risk from those folders.

---

## Why it's fast, accurate, and scalable

**Fast.** Small documents are read by a fast model in seconds; large ones take a couple of minutes because the AI is producing a thorough analysis. Crucially, documents are processed **in parallel** — a data room that would take hours read one-at-a-time is done in a fraction of the time. And critical documents finish first, so the deal is usable within minutes while the bulk trickles in.

**Accurate — and we measure it.** We benchmark the platform against **CUAD**, an industry dataset of 500+ commercial contracts hand-annotated by lawyers. On that gold standard, the platform **finds ~85–87% of the clauses that are genuinely present**, and **~93% of the quotes it extracts appear word-for-word in the source**. Just as important, we can *re-measure* after any change — so accuracy is a number we manage, not a hope. Where the AI is uncertain, it says so.

**Scalable.** The design target is **tens of thousands of documents per deal**. The keys: read each document once, do the cross-document and question-answering work with fast deterministic logic instead of re-reading everything, and spend the expensive analysis only on the documents that matter. The result is that the cost of asking a question or refreshing the deal picture stays flat no matter how big the deal gets — only the one-time cost of reading new documents grows, and that's tiered to stay affordable.

**Secure and compliant.** In production the AI runs inside the customer's own secure cloud (AWS Bedrock), so document data never leaves their control — inheriting enterprise-grade security and audit certifications, which matters for the legal and financial firms who are our users.

---

## Under the hood

*A little more detail on the three questions that come up most.*

### How many documents can it handle, and what does it cost?

**Capacity: from a handful to tens of thousands per deal.** A small deal might be a few hundred documents; a large one, tens of thousands. The design target is **20,000–100,000+ documents in a single deal**, and the architecture is built so the *ongoing* work stays cheap no matter how big the deal is:
- **Reading** a document happens **once**, and documents are read **in parallel**, so a large data room ingests in a fraction of the time it would take one-at-a-time.
- **Asking a question** or **refreshing the deal picture** costs the same whether the deal has 500 documents or 50,000 — because those operations work off the organized library and fast deterministic logic, not by re-reading everything.

So the only cost that grows with deal size is the **one-time cost of reading new documents** — and that's deliberately tiered to stay affordable.

**Price per document** is driven almost entirely by document *size* (how much text the AI has to read), and it's a one-time cost:

| Document | Read by | Typical cost |
|---|---|---|
| Short / routine (1–5 pages) | Fast model | **~$0.02–0.05** |
| Standard contract (10–30 pages) | Mid model | **~$0.20–0.40** |
| Large agreement (40–80+ pages) | Premium model | **~$0.40–1.00** |
| Bulk / duplicate | Skipped or stubbed | **~$0.00** |

Measured on real commercial contracts (the CUAD benchmark), the platform averages **~$0.30 per contract**. Across a *whole* data room — where most files are small, routine, or duplicates — the blended average is lower, because the system spends the budget on the documents that matter and handles the rest cheaply. **A 10,000-document mid-market data room lands in the low single-digit thousands of dollars, one time.** Compared to the analyst-hours it replaces, that's a rounding error.

### What CUAD is, and the three jobs it does for us

CUAD — the **Contract Understanding Atticus Dataset** — is a public, industry-standard dataset: **510 real commercial contracts, hand-annotated by lawyers**, tagging where each of **41 categories of important clauses** appears (change of control, cap on liability, non-compete, governing law, exclusivity, and so on). It's the closest thing the legal-AI world has to a shared "answer key" for contract reading. In this platform it does three distinct jobs — it's worth being precise about each, because they're often blurred together.

**1. It's the *vocabulary* the AI reads with.** We don't feed CUAD's contracts to the AI at runtime. Instead, we took CUAD's 41 lawyer-defined clause categories and turned them into a fixed checklist of clause types — each with a plain rule for *when it counts as present*. When Claude reads any uploaded document, it must classify what it finds into **exactly this vocabulary**, not invent its own labels. That's what makes the output consistent: an indemnity clause is tagged the same way whether it's in an NDA or an 80-page merger agreement, and whether it's read today or next month. Honestly, we also **extend** CUAD here — we added four categories CUAD never covered but that matter for M&A (indemnification, representations & warranties, confidentiality, payment terms), because a diligence tool can't have blind spots just because an academic dataset did.

**2. It's the *link* between a clause and the diligence checklist.** Every clause type in the CUAD vocabulary is mapped to the checklist item it helps answer — e.g. a `CAP_ON_LIABILITY` or `UNCAPPED_LIABILITY` clause is filed under the *Cap on Liability* item; a `CHANGE_OF_CONTROL` clause under *Change of Control*. This mapping is the plumbing that turns a pile of tagged clauses into an organized library. Importantly, **CUAD is the vocabulary, not the spine.** Many diligence items — pending litigation, the cap table, environmental issues — can't be answered by any contract clause at all; they come from facts and entities, not CUAD categories. That's exactly why the platform is organized around the *diligence checklist* and merely uses CUAD as the language of the clause-based evidence. Any clause that doesn't map cleanly to an item is still kept — it lands in a triage bucket so nothing is silently dropped.

**3. It's the *benchmark* we measure accuracy against.** Because CUAD contracts come with lawyer-verified answers, we can run our real pipeline over them and score it honestly against the ground truth. We measure three things: **recall** (of the clauses lawyers marked present, how many did we find?), **precision** (of the clauses we tagged, how many are right — scored only on the categories CUAD actually tracks, since it can't judge our four added types), and **grounding** (do our extracted quotes actually appear word-for-word in the document, i.e. did the AI hallucinate?). The numbers quoted above — ~85–87% recall, ~93% grounding — come from this harness. The real value is that it's **repeatable**: after any change to the prompts or models, we re-run it and see whether accuracy moved, and which clause categories are weakest and need tuning. Accuracy is a number we manage, not a claim we make.

**In one line:** CUAD gives us a lawyer-validated clause taxonomy that (a) constrains how the AI classifies every provision, (b) connects those provisions to the diligence checklist, and (c) lets us prove — and keep proving — that the extraction is accurate and honest.

### The knowledge library: a due-diligence checklist as a Table of Contents

The heart of the platform is the **library**, and its structure is what turns raw extraction into diligence. It's a **three-tier Table of Contents** — the same mental model a diligence team already uses:

```
Tier 1 — Workstreams  (≈12, the big diligence categories)
   └─ Tier 2 — Checklist items  (≈50, the specific things you look for)
         └─ Tier 3 — Evidence  (the actual clauses found, with source + page + quote)
```

- **Tier 1 — Workstreams.** The dozen diligence areas: *Corporate & Organizational, Financial, Commercial Contracts, Intellectual Property, Liability & Risk Allocation, Employment & Benefits, Real Property, Regulatory & Compliance, Data & Privacy, Litigation & Disputes, Tax,* and *Term & Key Dates.*
- **Tier 2 — Checklist items.** Under each workstream, the specific items a team checks — e.g., under Liability: *Indemnification, Cap on Liability, Change of Control.* Around 50 in total.
- **Tier 3 — Evidence.** As documents are read, each extracted clause is filed under the checklist item it answers, carrying a link back to its source document, page, and verbatim quote.

Two design choices make this powerful:
1. **The checklist is the spine; the clauses are the evidence.** We use the industry-standard CUAD clause vocabulary as the *language* of the evidence, but we organize by the *diligence checklist* — so the view is always "what does the deal need?" not "what clause types exist?"
2. **Gaps are first-class.** Every checklist item carries a status — **Covered, Flagged, Thin, or Open** — so the library shows you the **holes** (an Open item nobody has produced yet) as clearly as the coverage. That's the difference between a document reader and a diligence tool.

The library lives in two forms at once: a **durable, human-readable set of markdown files** (the permanent record), mirrored into a **database** for instant querying and permission-filtering. Every document that comes in updates it automatically.

### The deal map: seeing the whole deal at once

The library also renders as an interactive **visual knowledge graph** — the "deal map." It lets anyone see the entire deal's structure on one screen and trace any risk back to its source:

```
Workstream ──contains──▶ Checklist Item ──evidenced by──▶ Clause ──from──▶ Document
                                                            │
                                                         mentions
                                                            ▼
                                                    Entities (companies,
                                                    people, jurisdictions)
```

- **Nodes** are workstreams, checklist items, source documents, and entities; **connections** show which clause proves which item, which document it came from, and which parties it involves.
- **Color-coded by status** — so flagged risks and open gaps jump out visually.
- **Built to stay readable at scale.** Even on a 50,000-document deal, the top-level map stays clean: it always shows the workstreams and checklist items, plus the *most material* documents and entities, with a "+N more" indicator. You **click into any item to drill down** to its full evidence.
- **Every path is traceable** — from a deal-level risk, down to the checklist item, to the exact clause, to the page in the source document.

It turns "here are 10,000 documents" into a single navigable picture of how the deal actually fits together.

---

## The bottom line

DealDiligence.ai does what a room full of junior analysts does — read every document, extract every material clause, flag the risks, and spot the gaps — but faster, consistently, with a citation for every claim, and organized against the exact checklist a diligence team already uses. The human stays in control of the judgment calls; the platform does the reading, the organizing, and the remembering.

*It turns "we have 10,000 documents and three weeks" into "here's the deal's risk posture, here's what's missing, and here's the source for every line."*
