# DealDiligence.ai — Cost Analysis

> Operational cost model for the Claude-native architecture with the v2 quality upgrade (type router + playbook + two-pass verify + deal brief). Numbers below assume AWS Bedrock pricing for Claude (which matches Anthropic direct API pricing 1:1) and typical M&A document sizes. Last refreshed against pricing current as of Q1 2026.

## Pipeline additions vs. v1

The v2 upgrade adds per-document calls around extraction (classify + verify + citation regex) and a project-wide deal-brief rebuild on every reconciliation. Net impact: per-document cost +25%, per-deal still under $50 for mid-size deals.

| Added call | Model | When | Cost per call (mid-size doc) |
|---|---|---|---|
| Haiku classify (first 2 pages) | Haiku 4.5 | Every upload | ~$0.001 |
| Citation regex validator | (no LLM) | Every PDF extraction | $0 |
| Sonnet verify | Sonnet 4.6 | Every extraction | ~$0.18 |
| Peer-anomaly detection | Sonnet 4.6 | Per project, debounced | ~$0.08 amortized |
| Deal Brief rebuild | Sonnet 4.6 | Per distinct scope key, debounced | ~$0.40 × scopeCount |

Chat + risk-report calls get *cheaper* because they now read one synthesized brief instead of N per-doc fact sheets.

## 1. Claude token pricing (per million tokens)

| Model | Input | Output | Cache write | Cache read |
|---|---:|---:|---:|---:|
| Opus 4.7 | $15.00 | $75.00 | $18.75 | $1.50 |
| Sonnet 4.6 | $3.00 | $15.00 | $3.75 | $0.30 |
| Haiku 4.5 | $1.00 | $5.00 | $1.25 | $0.10 |

Cache write is `1.25×` input (written once per cache block per 5-minute TTL). Cache read is `0.1×` input — **90% discount** — applied to the cached portion of every subsequent request within the TTL.

Bedrock and direct Anthropic API publish the same per-token prices, so this table applies to both dev and prod hosting.

## 2. Token estimation for M&A documents

Dense legal PDFs run **~600-700 tokens per page** for body text. Native PDF input via Claude's `document` content block tokenizes inline; images and tables add ~200-400 tokens per dense page. Use ~700 tokens/page as a conservative planning figure.

| Doc type | Typical pages | Tokens (input) |
|---|---:|---:|
| NDA / short employment letter | 5-10 | 4k-7k |
| LOI / Term Sheet | 15-30 | 10k-21k |
| SPA / APA | 40-80 | 28k-56k |
| SPA with schedules & exhibits | 80-150 | 56k-105k |
| Debt agreement / credit facility | 100-200 | 70k-140k |

## 3. Per-action cost breakdown

Every cost number below is per-call on Opus 4.7 unless noted. The "Sonnet knob" column shows what the same call costs if the model is downgraded to Sonnet 4.6 — a 5× savings for a modest quality tradeoff on generation (not recommended for first-pass extraction).

### 3.1 First-pass extraction (one-time per document)

**Inputs**: PDF contents + cached system prompt (~4k tokens of CUAD schema + risk rubric).
**Output**: JSON response containing ~3-5 KB markdown fact sheet + entities + clauses + relationships — typically **2-4k output tokens**.

| Doc size | Input tokens | Opus 4.7 cost | Sonnet 4.6 cost |
|---|---:|---:|---:|
| 10 pages (~7k) | 7k | **$0.34** | $0.07 |
| 25 pages (~18k) | 18k | **$0.55** | $0.11 |
| 50 pages (~35k) | 35k | **$0.83** | $0.17 |
| 100 pages (~70k) | 70k | **$1.35** | $0.27 |
| 200 pages (~140k) | 140k | **$2.40** | $0.48 |

System prompt caching saves ~$0.06 per call after the first extraction within a 5-minute window; negligible on one-time extractions.

Formula (Opus 4.7):
```
cost = (input_tokens / 1e6 × $15) + (output_tokens / 1e6 × $75)
     ≈ (pages × 700 × $15 / 1e6) + (3000 × $75 / 1e6)
     ≈ (pages × $0.0105) + $0.225
```

### 3.2 Risk report (Kanban AI task)

**Inputs**: System prompt (~1k, cached) + attached documents' fact sheets (~3-5k tokens each, **cacheable across multi-turn and repeat runs**) + user prompt (~200 tokens).
**Output**: Risk report markdown (~2-4k tokens).

| Attached docs | Input (cold) | Input (cached) | Opus cost (cold) | Opus cost (cached) |
|---|---:|---:|---:|---:|
| 1 doc | ~5k | ~5k | **$0.30** | **$0.23** |
| 3 docs | ~15k | ~15k | **$0.45** | **$0.24** |
| 5 docs | ~25k | ~25k | **$0.60** | **$0.25** |
| 10 docs | ~50k | ~50k | **$0.98** | **$0.30** |

The second and later runs against the same document set within the 5-minute cache window fall to ~$0.25-0.30. A specialist iterating on a report (re-run with a refined prompt) effectively pays only for the new output tokens.

### 3.3 Chat (VDR Q&A)

**Model**: Haiku 4.5 (already configured in `CLAUDE_MODEL_CHAT`).
**Inputs**: System prompt (~500 tokens, cached) + all in-scope fact sheets (~20-50k tokens, cached across the conversation) + conversation history (~1-5k) + user message (~200).
**Output**: Answer (~300-800 tokens).

| Fact sheets in scope | Input (cached) | Per message |
|---|---:|---:|
| 5 docs (~20k) | 20k | **$0.005** |
| 15 docs (~60k) | 60k | **$0.009** |
| 40 docs (~160k) | 160k | **$0.020** |

Chat is effectively free at this scale — half a cent per message on a mid-size deal.

### 3.4 Cross-document reconciliation

**Model**: Sonnet 4.6.
**When**: Debounced — runs ~30 seconds after any document upload completes. For a project with N docs, the pass reads all N fact sheets.
**Inputs**: All project fact sheets (~4k each).
**Output**: Canonical entity list + relationships (~1-3k).

| Docs in project | Input | Sonnet cost |
|---|---:|---:|
| 5 | 20k | **$0.08** |
| 20 | 80k | **$0.28** |
| 50 | 200k | **$0.65** |

Runs at most once per debounce window regardless of how many docs are uploaded in quick succession.

## 4. Worked scenarios (per deal)

All numbers below are **LLM costs only** (add infrastructure from §5).

### Small deal — 10 documents averaging 25 pages

| Action | Count | Unit cost | Subtotal |
|---|---:|---:|---:|
| Extractions | 10 | $0.55 | $5.50 |
| Reconciliation rebuilds | 3 | $0.12 | $0.36 |
| AI risk reports | 5 (3 docs each) | $0.30 | $1.50 |
| Chat messages | 100 | $0.007 | $0.70 |
| **Deal total** | | | **≈ $8** |

### Mid-size deal — 25 documents averaging 50 pages

| Action | Count | Unit cost | Subtotal |
|---|---:|---:|---:|
| Extractions | 25 | $0.83 | $20.75 |
| Reconciliation rebuilds | 5 | $0.30 | $1.50 |
| AI risk reports | 15 (5 docs each) | $0.45 first / $0.25 repeat | $7.00 |
| Chat messages | 300 | $0.010 | $3.00 |
| **Deal total** | | | **≈ $32** |

### Large deal — 80 documents averaging 80 pages

| Action | Count | Unit cost | Subtotal |
|---|---:|---:|---:|
| Extractions | 80 | $1.35 | $108.00 |
| Reconciliation rebuilds | 10 | $0.55 | $5.50 |
| AI risk reports | 40 (5 docs each) | $0.45 first / $0.25 repeat | $22.00 |
| Chat messages | 800 | $0.018 | $14.40 |
| **Deal total** | | | **≈ $150** |

### Jumbo deal — 200 documents averaging 100 pages

| Action | Count | Unit cost | Subtotal |
|---|---:|---:|---:|
| Extractions | 200 | $1.68 | $336.00 |
| Reconciliation rebuilds | 20 | $0.90 | $18.00 |
| AI risk reports | 100 (5 docs each) | $0.35 blended | $35.00 |
| Chat messages | 2,000 | $0.022 | $44.00 |
| **Deal total** | | | **≈ $433** |

## 5. Infrastructure (AWS, monthly)

Baseline run-cost to support 5-20 concurrent active deals, excluding Claude:

| Service | Size | Monthly |
|---|---|---:|
| RDS PostgreSQL | `db.t4g.medium`, multi-AZ, 50 GB gp3 | $80-$110 |
| ECS Fargate (backend) | 2 × 0.5 vCPU / 1 GB | $30-$45 |
| ECS Fargate (frontend — Nginx) | 1 × 0.25 vCPU / 0.5 GB | $10-$15 |
| ALB | 1 standard | $18 |
| S3 | 20 GB docs + 1 GB fact sheets + Glacier archive | $3 |
| S3 request costs | ~100k GET/PUT/month | $2 |
| CloudFront (frontend delivery) | 50 GB egress | $5 |
| VPC endpoints (Bedrock + S3) | 2 interface endpoints | $15 |
| CloudWatch + CloudTrail | Standard | $15-$25 |
| Secrets Manager | 5 secrets | $2 |
| Auth0 | B2B Starter, 1,000 MAU | $140 |
| Sentry | Team, 50k events | $29 |
| **Baseline total** | | **≈ $350-$430/month** |

Scaling up: each doubling of concurrent deals adds roughly one Fargate task ($15) + marginal RDS IOPS. The LLM spend scales linearly with deal activity, not concurrent users.

### Network isolation premium (prod)

Bedrock via VPC endpoint (no egress to Anthropic's network) adds the $15/month PrivateLink fee. Worth it for the compliance story — data never traverses the public internet.

## 6. Unit economics

Assumption: customer pays **$500/user/month**, and a team of 5 processes 3 mid-size deals/month.

| Line | Monthly |
|---|---:|
| Revenue (5 seats) | $2,500 |
| Claude (3 × $32) | $96 |
| Infrastructure | $400 |
| **Gross margin** | **$2,004 (80%)** |

If the same team handles one large deal/month instead:

| Line | Monthly |
|---|---:|
| Revenue (5 seats) | $2,500 |
| Claude (1 × $150) | $150 |
| Infrastructure | $400 |
| **Gross margin** | **$1,950 (78%)** |

## 7. Cost-optimization levers (already implemented)

1. **Hash-based extraction idempotency** — `Document.extractionContentHash` skips re-extraction when a file is re-uploaded unchanged. Saves the largest single line item.
2. **Fact-sheet-first downstream reads** — every risk report, chat turn, and reconciliation pass reads the ~4 KB fact sheet, never the raw PDF. Turns multi-dollar queries into cent-scale ones.
3. **Prompt caching on stable blocks** — the ~4k-token CUAD schema + rubric is cached with `cache_control: { type: 'ephemeral' }`; attached fact sheets are cached during multi-turn report iteration.
4. **Model tiering** — Opus only for extraction + reports (where quality matters), Sonnet for reconciliation (markdown-only), Haiku for chat (fast lookups).
5. **Debounced reconciliation** — rapid bulk uploads coalesce into one graph rebuild per 30-second window.

## 8. Levers to pull if costs become a concern

1. **Downgrade extraction to Sonnet 4.6** — 5× savings on the biggest line item, at the cost of some subtle-clause recall. Set `CLAUDE_MODEL_EXTRACTION=claude-sonnet-4-6`.
2. **Batch extraction with AWS Bedrock Batch** — ~50% discount on batch inference, suitable for non-urgent re-extraction jobs.
3. **Trim the CUAD vocabulary to the 12 M&A-critical clauses** for routine NDAs and employment letters; keep the full 41 for SPA/APA. Reduces output tokens by ~30%.
4. **Skip reconciliation for deals under 5 documents** — add a `docs < 5 → skip` guard in `reconciliation.service.ts`.
5. **Haiku for first-draft reports**, Opus on "regenerate with higher-quality model" button. Good for specialist-initiated exploration.
6. **Chat context trimming** — fall back from full-project retrieval to task-attached-docs-only when total fact sheets exceed 100k tokens.

## 9. Pricing ladder suggestion

Tier the customer-facing plan by deal volume (keeps the unit economics honest):

| Plan | Price | Included deals/month | Included extraction pages |
|---|---:|---:|---:|
| Starter | $500/user/mo | Up to 3 mid-size | 2,000 |
| Growth | $1,200/user/mo | Up to 10 mid-size | 10,000 |
| Enterprise | Custom | Unlimited | Pooled |

Overage: bill extraction at $0.02/page, risk reports at $1/run, chat free. The $0.02/page figure bakes in 50% margin on Opus pricing.

## 10. Quick reference — back-of-envelope per-deal cost

```
deal_cost ≈ (avg_pages × doc_count × $0.015)   // extraction
          + (ai_task_count × $0.40)              // risk reports
          + (chat_msg_count × $0.01)             // chat
          + $2                                   // reconciliation buffer
```

For a 25-doc, 50-page-avg deal with 15 AI tasks and 300 chat messages:
```
(50 × 25 × $0.015) + (15 × $0.40) + (300 × $0.01) + $2
= $18.75 + $6 + $3 + $2 = $29.75
```

Matches the §4 mid-size scenario (≈ $32) within rounding — use this formula when sizing new customer deployments.
