import puppeteer from '../frontend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================ SHARED STYLE (matches Brief 1) ============================
const STYLE = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#152238; --ink-2:#1f3253; --ink-soft:#46556e;
    --brass:#b8893f; --brass-deep:#8f6a2c;
    --paper:#faf7f1; --paper-2:#f3eee3; --line:#e4dccd; --teal:#2c6e6a;
    --green:#3f7d54; --amber:#c08a2d; --red:#b1493e;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{ font-family:'Inter',sans-serif; color:#1c2740; background:var(--paper);
        font-size:10pt; line-height:1.62; -webkit-font-smoothing:antialiased; }
  h1,h2,h3,h4{ font-family:'Fraunces',Georgia,serif; color:var(--ink); margin:0; font-weight:600; }
  h2{ font-size:21pt; letter-spacing:-0.02em; line-height:1.06; }
  h3{ font-size:14pt; letter-spacing:-0.01em; margin-bottom:5px; }
  h4{ font-size:11pt; margin:0 0 4px; }
  p{ margin:0 0 9px; }
  strong{ color:var(--ink); font-weight:600; }
  .mono{ font-family:'IBM Plex Mono',monospace; }
  .muted{ color:var(--ink-soft); }

  .section{ page-break-before:always; }
  .eyebrow{ font-family:'IBM Plex Mono',monospace; font-size:8pt; letter-spacing:.22em;
            text-transform:uppercase; color:var(--brass-deep); font-weight:600; display:flex; align-items:center; gap:9px; margin-bottom:12px; }
  .eyebrow::after{ content:""; flex:1; height:1px; background:linear-gradient(90deg,var(--brass),transparent); }
  .lead{ font-size:11.5pt; line-height:1.6; color:var(--ink-soft); }

  .path{ font-family:'IBM Plex Mono',monospace; font-size:8pt; background:var(--ink); color:#e9e2d2;
         padding:1px 6px; border-radius:4px; white-space:nowrap; }
  .path .fn{ color:var(--brass); }

  .card{ background:#fffdf8; border:1px solid var(--line); border-radius:11px; padding:15px 18px;
         box-shadow:0 1px 2px rgba(21,34,56,.05), 0 14px 30px -20px rgba(21,34,56,.25); margin-bottom:13px; }
  .card.flush{ margin-bottom:0; }

  .callout{ border-left:3px solid var(--brass); background:linear-gradient(90deg, rgba(184,137,63,.07), rgba(184,137,63,.01));
            padding:11px 15px; border-radius:0 8px 8px 0; margin:11px 0; font-size:9.6pt; line-height:1.55; }
  .callout .lab{ font-family:'IBM Plex Mono',monospace; font-size:7.4pt; letter-spacing:.15em; text-transform:uppercase;
                 color:var(--brass-deep); font-weight:600; display:block; margin-bottom:3px; }
  .callout.teal{ border-left-color:var(--teal); background:linear-gradient(90deg, rgba(44,110,106,.08), rgba(44,110,106,.01)); }
  .callout.teal .lab{ color:var(--teal); }
  .callout.red{ border-left-color:var(--red); background:linear-gradient(90deg, rgba(177,73,62,.08), rgba(177,73,62,.01)); }
  .callout.red .lab{ color:var(--red); }

  .grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:13px; }
  .grid-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:11px; }

  ul.clean{ margin:5px 0 9px; padding-left:0; list-style:none; }
  ul.clean li{ position:relative; padding-left:17px; margin-bottom:5px; line-height:1.5; }
  ul.clean li::before{ content:""; position:absolute; left:2px; top:8px; width:6px; height:6px; border-radius:50%; background:var(--brass); }

  table.tbl{ width:100%; border-collapse:collapse; font-size:9pt; margin:7px 0; }
  table.tbl th{ text-align:left; font-family:'IBM Plex Mono',monospace; font-size:7.2pt; letter-spacing:.1em;
        text-transform:uppercase; color:var(--ink-soft); border-bottom:2px solid var(--line); padding:7px 9px; }
  table.tbl td{ padding:8px 9px; border-bottom:1px solid var(--line); vertical-align:top; }
  table.tbl tr:last-child td{ border-bottom:none; }
  table.tbl td.r{ text-align:right; font-family:'IBM Plex Mono',monospace; }
  table.tbl .win{ color:var(--ink); font-weight:600; }

  .kpi{ text-align:center; padding:13px 9px; }
  .kpi .big{ font-family:'Fraunces',serif; font-size:25pt; color:var(--ink); font-weight:600; line-height:1; letter-spacing:-0.02em; }
  .kpi .big .u{ font-size:13pt; color:var(--brass-deep); }
  .kpi .cap{ font-size:8.2pt; color:var(--ink-soft); margin-top:6px; line-height:1.4; }

  .pill{ display:inline-block; font-family:'IBM Plex Mono',monospace; font-size:7.2pt; font-weight:600;
         letter-spacing:.04em; padding:2px 8px; border-radius:20px; }
  .pill.lo{ background:#e7f0ea; color:#2f6242; border:1px solid #c3ddcb; }
  .pill.md{ background:#f6efda; color:#8a6a1f; border:1px solid #e6d6a8; }
  .pill.hi{ background:#f7e3df; color:#9a3f36; border:1px solid #ecc6bf; }
  .pill.ink{ background:#e8ecf2; color:#33425e; border:1px solid #cfd8e4; }

  .impl{ display:flex; gap:14px; break-inside:avoid; margin-bottom:13px; }
  .impl-rail{ flex:0 0 auto; }
  .impl-badge{ width:34px; height:34px; border-radius:9px; background:linear-gradient(150deg,var(--ink-2),var(--ink));
        color:#fff; font-family:'Fraunces',serif; font-weight:600; font-size:13pt; display:flex; align-items:center; justify-content:center; }
  .impl-body{ flex:1; }
  .impl-body h4{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

  .divider{ height:1px; background:var(--line); margin:16px 0; }
  .mb0{ margin-bottom:0; }
</style>`;

// ============================ COVER ============================
const coverHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">${STYLE}
<style>
  @page{ size:Letter; margin:0; }
  .cover{ width:8.5in; height:11in; padding:0.9in; position:relative; overflow:hidden;
    background: radial-gradient(130% 90% at 12% -5%, #21385e 0%, transparent 55%),
                radial-gradient(120% 80% at 100% 105%, #0e1828 0%, transparent 50%),
                linear-gradient(160deg, #182a47 0%, #101b2e 100%);
    color:#f1ece0; display:flex; flex-direction:column; justify-content:space-between; }
  .cover::before{ content:""; position:absolute; inset:0;
    background-image:linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px);
    background-size:34px 34px; mask-image:radial-gradient(120% 90% at 70% 20%, black, transparent 75%); }
  .cover>*{ position:relative; z-index:1; }
  .ctop{ display:flex; justify-content:space-between; align-items:center; }
  .logo{ display:flex; align-items:center; gap:11px; }
  .lmark{ width:34px; height:34px; border-radius:8px; background:linear-gradient(150deg,var(--brass),var(--brass-deep));
    display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; font-weight:700; font-size:16pt; color:#101b2e; }
  .lword{ font-family:'Fraunces',serif; font-size:13pt; font-weight:600; }
  .lword b{ color:var(--brass); }
  .ctag{ font-family:'IBM Plex Mono',monospace; font-size:8pt; letter-spacing:.2em; text-transform:uppercase; color:#9fb0c9; border:1px solid rgba(159,176,201,.35); border-radius:20px; padding:5px 13px; }
  .ceye{ font-family:'IBM Plex Mono',monospace; font-size:8pt; letter-spacing:.22em; text-transform:uppercase; color:var(--brass); font-weight:600; margin-bottom:16px; }
  .cover h1{ color:#fff; font-size:50pt; line-height:0.99; letter-spacing:-0.03em; margin:0 0 16px; }
  .cover h1 .accent{ color:var(--brass); font-style:italic; }
  .csub{ font-size:13pt; line-height:1.5; color:#c9d3e0; max-width:6.0in; }
  .crule{ width:64px; height:3px; background:var(--brass); margin:24px 0; border-radius:2px; }
  .cmeta{ display:flex; gap:34px; flex-wrap:wrap; }
  .cmeta .k{ font-family:'IBM Plex Mono',monospace; font-size:7.5pt; letter-spacing:.16em; text-transform:uppercase; color:#7e90ab; margin-bottom:4px; }
  .cmeta .v{ font-size:10.5pt; color:#eee7d8; font-weight:500; }
  .cfoot{ display:flex; justify-content:space-between; color:#7e90ab; font-family:'IBM Plex Mono',monospace; font-size:8pt; }
</style></head>
<body><div class="cover">
  <div class="ctop">
    <div class="logo"><div class="lmark">D</div><div class="lword">Deal<b>Diligence</b>.ai</div></div>
    <div class="ctag">Confidential · Internal</div>
  </div>
  <div>
    <div class="ceye">Technology Brief · Company 2 of 2</div>
    <h1>Isaacus</h1>
    <div class="csub">Foundational <span style="color:#e8d9bd;">legal</span> AI models — embeddings, zero-shot clause classification, reranking, and graph enrichment — and how they slot into DealDiligence's retrieval and extraction layers.</div>
    <div class="crule"></div>
    <div class="cmeta">
      <div><div class="k">Company</div><div class="v">Isaacus (isaacus.com)</div></div>
      <div><div class="k">Category</div><div class="v">Legal embedding &amp; classifier models</div></div>
      <div><div class="k">Access</div><div class="v">API · AWS · self-hosted</div></div>
    </div>
  </div>
  <div class="cfoot"><span>Evaluation &amp; integration options</span><span>Already named in our ARCHITECTURE.md</span></div>
</div></body></html>`;

// ============================ BODY ============================
const body = `
<!-- EXEC -->
<section>
  <div class="eyebrow">Executive summary</div>
  <h2>What this is, and why it matters to us</h2>
  <p class="lead" style="margin:12px 0 14px;"><strong style="color:var(--ink)">Isaacus</strong> is an Australian foundational legal-AI company that builds small, fast, <strong>specialized legal models</strong> — not chatbots. Their <strong>Kanon</strong> family covers the exact infrastructure layers DealDiligence needs: turning contracts into searchable vectors, detecting clauses with zero examples, reranking results, and extracting structured graphs. Their legal-tuned embedder ranks <strong>#1 on the industry's main legal benchmark</strong>, beating OpenAI, Google, and Voyage while being faster and smaller — at <strong>$0.35 per million tokens</strong>.</p>

  <div class="grid-3" style="margin-bottom:14px;">
    <div class="card kpi flush"><div class="big">#1</div><div class="cap">On MLEB, the Massive Legal Embedding Benchmark — ahead of 20 models</div></div>
    <div class="card kpi flush"><div class="big">+9<span class="u">%</span></div><div class="cap">More accurate than OpenAI's top embedder, &gt;30% faster, on legal text</div></div>
    <div class="card kpi flush" style="border:1px solid var(--brass);background:linear-gradient(150deg,#fbf6ec,#f7ead2);"><div class="big">38</div><div class="cap">Jurisdictions of laws, cases &amp; contracts in their training data</div></div>
  </div>

  <div class="callout teal"><span class="lab">Why it's directly relevant — it's already in our plan</span>Our own <span class="path" style="font-size:7.4pt;">ARCHITECTURE.md</span> names <strong>Isaacus</strong> as a candidate retrieval provider behind the <span class="mono" style="font-size:8pt;">Retriever</span> interface (alongside Voyage / OpenAI). Today we run a "stuff-everything" retriever with no real semantic search. Isaacus is the drop-in that turns that into best-in-class <em>legal</em> retrieval — plus three more models that map onto clause detection, the knowledge graph, and verification.</div>

  <p class="mb0"><strong>Bottom line up front:</strong> where Company 1 (Stateful Swarms) is an <em>orchestration brain</em>, Isaacus is <strong>battle-tested specialized infrastructure</strong> — used by Microsoft, IBM, and the World Bank, serving 40B tokens/month, with SOC/ISO/IRAP compliance and self-hosting. The fastest win is swapping the embedder into our planned vector retriever; the highest-value win is using their zero-shot classifier to detect CUAD clauses and playbook red-flags cheaply, without an LLM call.</p>
</section>

<!-- COMPANY -->
<section class="section">
  <div class="eyebrow">01 · The company</div>
  <h2>Who Isaacus is</h2>
  <p class="lead" style="margin:12px 0 13px;">A foundational legal-AI startup with a deliberate thesis: <strong>specialized models beat general-purpose chatbots</strong> for legal work. They build focused, best-in-class tools — "effective, efficient, scalable" — rather than another GPT wrapper.</p>

  <div class="grid-2" style="margin-bottom:6px;">
    <div class="card flush">
      <h4>Traction &amp; customers</h4>
      <ul class="clean mb0" style="font-size:9.3pt;">
        <li>Used by <strong>Microsoft, IBM, UC Berkeley, the World Bank</strong>, and major universities</li>
        <li><strong>40 billion tokens</strong> served monthly</li>
        <li><strong>4M monthly downloads</strong> of their open-source tooling</li>
      </ul>
    </div>
    <div class="card flush">
      <h4>Deployment &amp; compliance</h4>
      <ul class="clean mb0" style="font-size:9.3pt;">
        <li>Cloud API, <strong>AWS Marketplace</strong> (air-gapped SageMaker), and <strong>self-hosted / on-prem</strong></li>
        <li><strong>SOC, ISO, and IRAP</strong> compliance certifications</li>
        <li>Models small enough to run privately — even on-device</li>
      </ul>
    </div>
  </div>

  <div class="callout"><span class="lab">Compliance fit</span>Self-hosted + SOC/ISO/IRAP maps cleanly onto our prod posture — Claude via Bedrock <em>inside the customer's AWS account</em>. Isaacus can run in the same isolated environment, so contracts never leave the client's perimeter. That's a strong story for regulated M&amp;A buyers.</div>

  <h3 style="margin-top:14px;">They also set the benchmarks</h3>
  <p style="font-size:9.5pt;">Isaacus authored the open-source standards the field is measured against — credibility that they build for retrieval quality, not hype:</p>
  <ul class="clean">
    <li><strong>MLEB (Massive Legal Embedding Benchmark)</strong> — the largest legal-retrieval benchmark: 10 datasets across 6 jurisdictions (US, UK, EU, Australia, Singapore, Ireland) and 5 domains (cases, statutes, regulations, contracts, academia).</li>
    <li><strong>Legal RAG Bench</strong> — evaluates retrieval-augmented generation on legal questions.</li>
    <li><strong>semchunk</strong> — their open-source semantic chunking library, ~4M downloads/month, used across major tech companies (free for us to use in any embedding pipeline).</li>
  </ul>
</section>

<!-- PRODUCTS -->
<section class="section">
  <div class="eyebrow">02 · The product family</div>
  <h2>The Kanon models</h2>
  <p class="lead" style="margin:12px 0 13px;">Five capabilities, each a small specialized model, billed per input token. Every one maps to a layer we already have or plan to build.</p>

  <table class="tbl">
    <tr><th>Model</th><th>What it does</th><th class="r">$ / 1M tokens</th></tr>
    <tr><td><strong>Kanon 2 Embedder</strong></td><td>Legal embeddings for semantic search &amp; clustering — #1 on MLEB</td><td class="r">$0.35</td></tr>
    <tr><td><strong>Kanon 2 Reranker</strong></td><td>Re-orders retrieved passages by legal relevance to a query</td><td class="r">$0.35</td></tr>
    <tr><td><strong>Kanon Universal Classifier</strong></td><td>Zero-shot clause/concept classification from plain-English criteria</td><td class="r">$1.00</td></tr>
    <tr><td><strong>Kanon Answer Extractor</strong></td><td>Extractive QA — pulls exact verbatim answers from documents</td><td class="r">$1.50</td></tr>
    <tr><td><strong>Kanon 2 Enricher</strong></td><td>"Graphitization" — documents → hierarchical knowledge graphs, sub-second</td><td class="r">$3.50</td></tr>
  </table>

  <div class="callout teal" style="margin-top:12px;"><span class="lab">The standout — zero-shot legal classification</span>The <strong>Universal Classifier</strong> needs no training examples. You write a plain-English statement — e.g. <em>"This clause entitles one to terminate an agreement in the event of circumstances beyond their reasonable control"</em> — and it scores how strongly each passage matches, with "startlingly accurate confidence scores." It can even assess <em>"whether an agreement unilaterally benefits one party"</em> — which is essentially automated red-flag detection. It comes in two sizes: <strong>317M</strong> params (+6% vs competitors) and a <strong>136M</strong> "Mini" (+12%, 441MB — small enough to run on a phone).</div>

  <p class="mb0" style="font-size:9pt;color:var(--ink-soft);">All Kanon models are built on a legal foundation model trained on millions of laws, regulations, cases, contracts, and papers across 38 jurisdictions — which is why they beat general-purpose models on legal text despite being far smaller. A proprietary global legal corpus, <strong>Blackstone Graph</strong>, is in development.</p>
</section>

<!-- MAPPING -->
<section class="section">
  <div class="eyebrow">03 · The fit</div>
  <h2>How it maps onto DealDiligence</h2>
  <p class="lead" style="margin:12px 0 13px;">Unlike a brand-new architecture, Isaacus slots into components we already have. Each model upgrades a specific layer.</p>

  <table class="tbl">
    <tr><th>DealDiligence layer</th><th>Isaacus model</th><th>What changes</th></tr>
    <tr><td><span class="mono" style="font-size:8pt;">stuffRetriever</span> (no embeddings, returns everything)</td><td>Kanon 2 Embedder</td><td class="win">The named "PgVectorRetriever" swap — real legal semantic search</td></tr>
    <tr><td>CUAD clause detection (Opus extraction)</td><td>Universal Classifier</td><td class="win">Detect/verify clauses zero-shot, no LLM, $1/M</td></tr>
    <tr><td>Playbook red-flag matching</td><td>Universal Classifier</td><td class="win">Score "does this unfairly favor one side?" deterministically</td></tr>
    <tr><td>Haiku document-type classifier</td><td>Universal Classifier</td><td>Cheaper, legal-tuned doc categorization</td></tr>
    <tr><td>Chat &amp; task-attachment retrieval</td><td>Kanon 2 Reranker</td><td>Rank fact sheets/clauses before they reach Claude</td></tr>
    <tr><td>Reconciliation → MasterEntity / Relationship graph</td><td>Kanon 2 Enricher</td><td class="win">Sub-second graphitization of entities &amp; relationships</td></tr>
    <tr><td>Verify layer (citation validation)</td><td>Kanon Answer Extractor</td><td>Pull exact grounded quotes to check citations</td></tr>
  </table>

  <div class="callout"><span class="lab">The cleanest entry point</span>Our <span class="mono" style="font-size:8pt;">Retriever</span> interface was <em>designed</em> for this swap — "<span class="muted">when scale demands, swap in PgVectorRetriever or a provider (Voyage / Isaacus / OpenAI) behind the same interface; nothing else changes.</span>" Dropping in the Kanon 2 Embedder is a contained change with an immediate quality lift on chat and retrieval, and no rework anywhere else.</div>
</section>

<!-- IMPLEMENTATIONS -->
<section class="section">
  <div class="eyebrow">04 · What we could actually do</div>
  <h2>Potential implementations</h2>
  <p class="lead" style="margin:12px 0 14px;">Ranked by effort-to-value. Each carries an effort and impact rating.</p>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">1</div></div>
    <div class="impl-body">
      <h4>Kanon 2 Embedder as our vector retriever <span class="pill lo">Effort: Low</span> <span class="pill hi">Impact: High</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Implement the planned <span class="mono" style="font-size:8pt;">PgVectorRetriever</span> using Kanon 2 Embedder behind our existing <span class="mono" style="font-size:8pt;">Retriever</span> interface, with their open-source <strong>semchunk</strong> for chunking. Immediately upgrades VDR chat and task-attachment retrieval from "load everything in scope" to true legal semantic search — better answers, fewer tokens into Claude. Lowest-risk, highest-certainty win.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">2</div></div>
    <div class="impl-body">
      <h4>Universal Classifier for clause &amp; red-flag detection <span class="pill md">Effort: Med</span> <span class="pill hi">Impact: High</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Use zero-shot classification to (a) <strong>verify</strong> the clauses Opus claims to have found — a cheap legal cross-check that strengthens our verify layer, (b) detect <strong>playbook red-flags</strong> by scoring plain-English statements against each clause, and (c) pre-screen long documents for clause presence before spending Opus tokens. Deterministic, legal-tuned, $1/M — a strong complement to (not replacement for) Claude's structured extraction.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">3</div></div>
    <div class="impl-body">
      <h4>Kanon 2 Reranker on retrieval results <span class="pill lo">Effort: Low</span> <span class="pill md">Impact: Med</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Add a rerank pass over retrieved fact sheets/clauses so the most relevant context reaches Claude first. Pairs naturally with implementation #1, cuts wasted context tokens, and sharpens chat answers — at $0.35/M, effectively free at our volume.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">4</div></div>
    <div class="impl-body">
      <h4>Kanon 2 Enricher to accelerate the knowledge graph <span class="pill md">Effort: Med</span> <span class="pill md">Impact: Med–High</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Our reconciliation builds a MasterEntity + relationship graph via a Sonnet pass. The Enricher graphitizes documents into hierarchical entity/relationship structures in sub-second time — it could seed or accelerate that graph (and the Cytoscape explorer) more cheaply and consistently than a full LLM reconciliation each rebuild.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">5</div></div>
    <div class="impl-body">
      <h4>Self-hosted deployment for regulated clients <span class="pill md">Effort: Med</span> <span class="pill md">Impact: Strategic</span></h4>
      <p class="mb0" style="font-size:9.4pt;">For SOC 2 / data-residency-sensitive buyers, run Kanon models air-gapped in the customer's AWS alongside our Bedrock deployment. Keeps the entire retrieval + classification stack inside the client perimeter — a differentiator in enterprise M&amp;A sales.</p>
    </div>
  </div>
</section>

<!-- TWO COMPANIES -->
<section class="section">
  <div class="eyebrow">05 · The two companies together</div>
  <h2>Isaacus vs Stateful Swarms — and why both</h2>
  <p class="lead" style="margin:12px 0 13px;">The two vendors operate at different layers of the stack. They aren't competitors for our attention — they're complementary.</p>

  <table class="tbl">
    <tr><th>Dimension</th><th>Stateful Swarms (Iqidis)</th><th>Isaacus</th></tr>
    <tr><td>What it is</td><td>Multi-agent orchestration "brain"</td><td>Specialized legal infra models</td></tr>
    <tr><td>Layer</td><td>Coordination &amp; reasoning</td><td>Retrieval, classification, graph</td></tr>
    <tr><td>Maturity</td><td>Early — "Phase 0, unproven"</td><td class="win">Production — enterprise customers</td></tr>
    <tr><td>Access</td><td>MIT open source</td><td>Commercial API / self-host</td></tr>
    <tr><td>Cost model</td><td>You run the models (any provider)</td><td>$0.35–$3.50 / M tokens</td></tr>
    <tr><td>Best first move</td><td>MCP pilot on 2–3 deals</td><td class="win">Swap embedder into retriever</td></tr>
    <tr><td>Primary risk</td><td>Immature, uncalibrated</td><td>Vendor dependency, jurisdiction coverage</td></tr>
  </table>

  <div class="callout teal"><span class="lab">How they'd combine</span>Isaacus supplies the <strong>primitives</strong> — legal embeddings, zero-shot clause scoring, graph enrichment — that any pipeline (ours today, or a swarm tomorrow) consumes. A future stateful-swarm reconciliation could use the Kanon Embedder for retrieval and the Universal Classifier as a cheap, deterministic "debt sensor" for clause presence. <strong>Adopt Isaacus for the building blocks now; treat the swarm as an architecture to grow into.</strong></div>
</section>

<!-- RISKS + REC -->
<section class="section">
  <div class="eyebrow">06 · The honest assessment</div>
  <h2>Risks &amp; recommendation</h2>

  <h3 style="margin:10px 0 8px;">Risks &amp; caveats</h3>
  <ul class="clean">
    <li><strong>Vendor dependency.</strong> Embeddings are low lock-in (behind our <span class="mono" style="font-size:8pt;">Retriever</span> interface, swappable) — but the Classifier and Enricher are more bespoke; build abstractions so we're not trapped.</li>
    <li><strong>Jurisdiction coverage.</strong> Training spans 38 jurisdictions and MLEB covers US/UK/EU/AU/SG/IE — confirm strong coverage for the specific markets our deals concentrate in before relying on it.</li>
    <li><strong>It scores, it doesn't draft.</strong> The Universal Classifier returns presence/confidence, not full structured extraction — it complements Claude's generative extraction, not replaces it.</li>
    <li><strong>Infra addition.</strong> Embeddings require a vector store (pgvector) we don't run yet — modest new infrastructure, already on our roadmap.</li>
    <li><strong>Per-token cost at scale.</strong> Cheap per call, but re-embedding large document sets adds up; like extraction, it's a one-time-per-document cost and should be cached/idempotent.</li>
    <li><strong>Smaller vendor.</strong> An Australian startup vs a hyperscaler — though strong enterprise adoption, compliance certs, and self-hosting de-risk this materially.</li>
  </ul>

  <div class="callout" style="margin-top:4px;"><span class="lab">Recommendation</span>Isaacus is the <strong>lower-risk, faster-payback</strong> of the two companies and is already earmarked in our architecture. <strong>Move on implementation #1 (Kanon 2 Embedder as our vector retriever) as a near-term project</strong> — it delivers a concrete chat/retrieval quality lift with contained scope. Trial the Universal Classifier in parallel as a verify-layer and red-flag enhancement. Keep self-hosting in our back pocket for the first regulated enterprise deal.</div>

  <div class="card" style="background:linear-gradient(150deg,#182a47,#101b2e);border:none;color:#e9e2d2;margin-top:8px;">
    <p class="mb0" style="color:#cdd6e3;font-size:9.6pt;"><strong style="color:#fff;">Combined verdict.</strong> Adopt <strong style="color:var(--brass);">Isaacus</strong> now for retrieval + classification building blocks; <strong>pilot Stateful Swarms</strong> as the longer-horizon orchestration upgrade. The two are complementary layers of the same future stack.</p>
  </div>

  <p style="font-size:8.6pt;color:var(--ink-soft);margin-top:12px;">Sources: isaacus.com, docs.isaacus.com (capabilities, models, pricing), the Kanon 2 Embedder &amp; MLEB announcements, and our own ARCHITECTURE.md retrieval note. Figures are vendor-reported; validate on our data during a pilot.</p>
</section>`;

const bodyHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">${STYLE}</head><body>${body}</body></html>`;

// ============================ RENDER ============================
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
async function render(html, out, opts) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.pdf({ path: out, printBackground: true, ...opts });
  await page.close();
}

const coverPdf = join(__dirname, '_t2_cover.pdf');
const bodyPdf = join(__dirname, '_t2_body.pdf');
const finalPdf = join(__dirname, 'DealDiligence-TechBrief-2-Isaacus.pdf');

writeFileSync(join(__dirname, 'tech-brief-2.html'), bodyHTML);
await render(coverHTML, coverPdf, { format: 'Letter', preferCSSPageSize: true });
await render(bodyHTML, bodyPdf, {
  format: 'Letter',
  margin: { top: '0.78in', bottom: '0.62in', left: '0.7in', right: '0.7in' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:8px;font-family:monospace;color:#9a8f7a;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;letter-spacing:.08em;"><span style="color:#8f6a2c;font-weight:bold;">DEALDILIGENCE.AI</span><span>TECHNOLOGY BRIEF · ISAACUS</span></div>`,
  footerTemplate: `<div style="font-size:8px;font-family:monospace;color:#9a8f7a;width:100%;padding:0 0.7in;text-align:right;">p.<span class="pageNumber"></span></div>`,
});
await browser.close();

execSync(`gs -dNOPAUSE -dBATCH -dQUIET -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -sOutputFile="${finalPdf}" "${coverPdf}" "${bodyPdf}"`);
rmSync(coverPdf); rmSync(bodyPdf);
console.log('Built: ' + finalPdf);
