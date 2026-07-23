import puppeteer from '../frontend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================ SHARED STYLE ============================
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

  /* swarm loop diagram */
  .loop{ background:#fffdf8; border:1px solid var(--line); border-radius:13px; padding:18px; box-shadow:0 1px 2px rgba(21,34,56,.05); }
  .loop-row{ display:flex; align-items:stretch; gap:8px; margin-bottom:8px; }
  .lbox{ flex:1; border-radius:8px; padding:8px 10px; border:1px solid var(--line); background:var(--paper-2); }
  .lbox .t{ font-weight:600; color:var(--ink); font-size:8.8pt; display:block; }
  .lbox .d{ color:var(--ink-soft); font-size:7.8pt; line-height:1.3; }
  .lbox.ai{ background:linear-gradient(150deg,#eaf3f2,#e1efed); border-color:#c4dedb; }
  .lbox.core{ background:linear-gradient(150deg,#172a47,#101c2f); border:none; }
  .lbox.core .t{ color:#fff; } .lbox.core .d{ color:#b9c6d8; }
  .larr{ display:flex; align-items:center; color:var(--brass); font-size:12pt; font-weight:700; }
  .lstack{ display:flex; flex-direction:column; align-items:center; color:var(--brass); font-size:12pt; line-height:.6; margin:1px 0; }

  /* implementation card */
  .impl{ display:flex; gap:14px; break-inside:avoid; margin-bottom:13px; }
  .impl-rail{ flex:0 0 auto; }
  .impl-badge{ width:34px; height:34px; border-radius:9px; background:linear-gradient(150deg,var(--ink-2),var(--ink));
        color:#fff; font-family:'Fraunces',serif; font-weight:600; font-size:13pt; display:flex; align-items:center; justify-content:center; }
  .impl-body{ flex:1; }
  .impl-body h4{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .impl-meta{ font-family:'IBM Plex Mono',monospace; font-size:7pt; letter-spacing:.1em; text-transform:uppercase; color:var(--brass-deep); margin-right:4px; }

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
  .cover h1{ color:#fff; font-size:47pt; line-height:0.99; letter-spacing:-0.03em; margin:0 0 16px; }
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
    <div class="ceye">Technology Brief · Company 1 of 2</div>
    <h1>Stateful<br><span class="accent">Swarms</span></h1>
    <div class="csub">Iqidis &amp; the <span style="color:#e8d9bd;">irys-stateful-swarms</span> engine — a persistent, multi-agent architecture for analyzing complex document sets, and how it could plug into DealDiligence.</div>
    <div class="crule"></div>
    <div class="cmeta">
      <div><div class="k">Company</div><div class="v">Iqidis (iqidis.ai)</div></div>
      <div><div class="k">Product</div><div class="v">Irys legal-AI platform</div></div>
      <div><div class="k">Code</div><div class="v">MIT · github.com/dl1683</div></div>
    </div>
  </div>
  <div class="cfoot"><span>Evaluation &amp; integration options</span><span>Verified against repo + benchmark</span></div>
</div></body></html>`;

// ============================ BODY ============================
const body = `
<!-- EXEC SUMMARY -->
<section>
  <div class="eyebrow">Executive summary</div>
  <h2>What this is, and why it matters to us</h2>
  <p class="lead" style="margin:12px 0 14px;"><strong style="color:var(--ink)">irys-stateful-swarms</strong> is an open-source (MIT) engine from <strong>Iqidis</strong> — the team behind <strong>Irys</strong>, a legal-AI platform. It coordinates several inexpensive AI models around a shared, persistent <strong>"blackboard"</strong> of typed, source-cited findings that accumulates across iterations and sessions. The headline result: on a 1,251-task legal benchmark it beat both Harvey and frontier models on accuracy while costing <strong>~40× less per task</strong> — using cheap models that score 0% on their own.</p>

  <div class="grid-3" style="margin-bottom:14px;">
    <div class="card kpi flush"><div class="big">17.75<span class="u">%</span></div><div class="cap">Strict all-pass on the Harvey Legal benchmark — vs Harvey's best 10.4% and frontier 13.3%</div></div>
    <div class="card kpi flush"><div class="big">$1.30</div><div class="cap">Cost per task vs Harvey's ~$50.90 — about 40× cheaper</div></div>
    <div class="card kpi flush" style="border:1px solid var(--brass);background:linear-gradient(150deg,#fbf6ec,#f7ead2);"><div class="big">98<span class="u">×</span></div><div class="cap">"Intelligence per dollar" vs Harvey's initial result</div></div>
  </div>

  <div class="callout teal"><span class="lab">Why it's directly relevant</span>Its proven tasks <em>are</em> our domain — comparing a draft credit agreement to its commitment letter, flagging merger-remedy deviations against precedent, extracting liens and transaction entities. This is a more advanced, <strong>stateful</strong> version of exactly what DealDiligence does today (extract → reconcile → brief). And it ships an <strong>MCP server</strong> and already supports the Anthropic SDK, so it can plug into our Claude-native stack with minimal glue.</p></div>

  <p class="mb0"><strong>Bottom line up front:</strong> the architecture is adoptable and the code is permissively licensed. The highest-value ideas for us are (1) the persistent blackboard to upgrade our single-pass reconciliation, (2) a cheap-model cascade to cut our biggest cost line — extraction, and (3) persistent "matter memory" that makes repeat questions on a deal nearly free. Recommended first step: a low-cost <strong>MCP pilot on 2–3 real deals</strong>. Caveats and risks are covered on the final pages.</p>
</section>

<!-- WHO -->
<section class="section">
  <div class="eyebrow">01 · The company &amp; the code</div>
  <h2>Who's behind it</h2>

  <div class="grid-2" style="margin:14px 0;">
    <div class="card flush">
      <h4>Iqidis <span class="muted" style="font-weight:400;font-size:8.5pt;">— the company</span></h4>
      <p class="mb0" style="font-size:9.5pt;">A small team building <strong>Irys</strong> (irys.ai), a "unified legal AI platform" positioned against Harvey. The commercial product adds persistent document indexes, entity &amp; knowledge graphs, citation verification against <strong>50M+ court opinions</strong>, drafting with tracked changes, and a matter-management workspace. Contact is public (<span class="mono" style="font-size:8pt;">devansh@iqidis.ai</span>); they run a monthly contributor bounty and recruit from the open-source work.</p>
    </div>
    <div class="card flush">
      <h4>irys-stateful-swarms <span class="muted" style="font-weight:400;font-size:8.5pt;">— the open repo</span></h4>
      <p class="mb0" style="font-size:9.5pt;">The <strong>coordination engine</strong> open-sourced under <strong>MIT</strong> — a Python 3.12 package. It deliberately ships the <em>stateless</em> version (every task starts from zero) so the benchmark is fair; the persistent layer lives in the commercial product and a companion repo (MapU). Multi-provider: Google Gemini (default), <strong>Anthropic</strong>, and OpenAI. Includes a CLI and an <strong>MCP server</strong>.</p>
    </div>
  </div>

  <div class="callout red"><span class="lab">Name collision — important for due diligence</span>This "<strong>Irys</strong>" (legal AI, <span class="mono" style="font-size:8pt;">irys.ai</span>, by Iqidis) is <strong>unrelated</strong> to "<strong>Irys</strong>" the crypto/blockchain "programmable datachain" (<span class="mono" style="font-size:8pt;">irys.xyz</span>). Same name, different companies. If you search the web you'll mostly hit the blockchain one — ignore it; everything in this brief is the legal-AI Iqidis project.</div>

  <h3 style="margin-top:14px;">The broader open-source stack</h3>
  <p style="font-size:9.5pt;">The swarm engine is one of five pieces Iqidis has released. The others are research-grade but point at problems we also have:</p>
  <table class="tbl">
    <tr><th>Component</th><th>What it does</th><th>Relevance to us</th></tr>
    <tr><td><strong>irys-stateful-swarms</strong></td><td>Multi-agent coordination + blackboard state</td><td class="win">Core — our extraction/reconciliation analogue</td></tr>
    <tr><td><strong>MapU</strong></td><td>Persistent, conflict-aware knowledge memory (Postgres + pgvector)</td><td class="win">Our planned "pgvector retriever," done</td></tr>
    <tr><td><strong>Fractal Embeddings</strong></td><td>Hierarchical embeddings (domain → category → detail)</td><td>Better clause-in-context retrieval</td></tr>
    <tr><td><strong>Latent Space Reasoning</strong></td><td>Improves a model's reasoning at inference, no training</td><td>Cheaper accuracy on weak stages</td></tr>
    <tr><td><strong>CTI Universal Law</strong></td><td>Predicts which model fits which task</td><td>Principled model routing</td></tr>
  </table>
</section>

<!-- PROBLEM -->
<section class="section">
  <div class="eyebrow">02 · The idea</div>
  <h2>The problem it solves: forgetfulness</h2>
  <p class="lead" style="margin:12px 0 12px;">Today's AI systems forget everything between sessions. Every question re-reads the same documents, re-discovers the same entities, and re-derives the same analysis from scratch. Context windows get compacted, destroying detail; session boundaries erase progress; ordinary retrieval pulls back text snippets but not the <em>understanding</em> built from them.</p>

  <div class="card">
    <h3>The fix: a persistent "blackboard"</h3>
    <p class="mb0">Instead of treating each analysis as disposable, the system writes every finding to a shared, structured <strong>blackboard</strong> — a typed, fully source-attributed knowledge base. Every observation, calculation, analysis, and <em>gap</em> is preserved with a pointer back to the exact document and section it came from. Nothing is summarized away; nothing is forgotten. The blackboard — not the final memo — is the real artifact: an inspectable, auditable reasoning trace that accumulates over time and makes each subsequent question cheaper and more accurate than the last.</p>
  </div>

  <div class="callout"><span class="lab">The thesis that makes it remarkable</span>The same cheap Gemini models that score <strong>0%</strong> in other agent frameworks hit <strong>17.75%</strong> here. The conclusion the authors draw — and demonstrate — is that <strong>the capability comes from the architecture, not the model</strong>. You don't need a frontier model to do professional document analysis; you need a system that knows how to build and maintain analytical state.</div>

  <p class="mb0">For us, the economic punchline matters most: extraction is ~70% of the cost and is paid <strong>once</strong> per document set in a stateful deployment. Follow-up questions skip re-reading entirely. Iqidis claims their persistent product cuts multi-turn cost by up to <strong>1,000×</strong> versus re-computing from scratch.</p>
</section>

<!-- HOW IT WORKS -->
<section class="section">
  <div class="eyebrow">03 · Under the hood</div>
  <h2>How the swarm actually works</h2>
  <p class="lead" style="margin:12px 0 14px;">It behaves less like a pipeline and more like a <strong>control system</strong>: it measures the state of its own understanding, compares it against what the task demands, and dispatches small workers to close the gaps — looping until measurable conditions are met.</p>

  <div class="loop">
    <div class="loop-row">
      <div class="lbox"><span class="t">① Seed plan</span><span class="d">Before reading in depth, a planner scans structure and writes a strategy + targeted questions ("signals").</span></div>
      <div class="larr">→</div>
      <div class="lbox ai"><span class="t">② Parallel read <span class="pill ink">cheap</span></span><span class="d">Worker models read sections and write grounded observations, each cited to a document + section.</span></div>
    </div>
    <div class="lstack">↓</div>
    <div class="loop-row">
      <div class="lbox core"><span class="t">◆ The Blackboard</span><span class="d">Typed entries — observation · analysis · calculation · gap · contradiction — with source, confidence, and links (supports / contradicts / supersedes). Plus open "signals" (questions).</span></div>
    </div>
    <div class="lstack">↓</div>
    <div class="loop-row">
      <div class="lbox ai"><span class="t">③ Orchestrate</span><span class="d">A controller reads blackboard state and dispatches the next workers: read more, analyze, or cross-reference.</span></div>
      <div class="larr">→</div>
      <div class="lbox"><span class="t">④ Converge?</span><span class="d">An adversarial check asks "why is this NOT done?" If gaps remain, loop back. Up to N iterations.</span></div>
      <div class="larr">→</div>
      <div class="lbox ai"><span class="t">⑤ Synthesize <span class="pill ink">stronger</span></span><span class="d">A stronger model writes the deliverable from the accumulated state.</span></div>
    </div>
  </div>

  <h3 style="margin-top:16px;">The three-tier model cascade</h3>
  <p style="font-size:9.5pt;margin-bottom:6px;">Work is routed to the cheapest model that can do it — the cost lever that makes the economics work.</p>
  <table class="tbl">
    <tr><th>Tier</th><th>Job</th><th>Default model</th></tr>
    <tr><td><strong>Read</strong></td><td>Source reading, extraction, structural profiling</td><td>Gemini 3.1 Flash Lite ($0.25/M)</td></tr>
    <tr><td><strong>Reason</strong></td><td>Analysis, cross-reference, gap detection, synthesis</td><td>Gemini 3.5 Flash ($1.50/M)</td></tr>
    <tr><td><strong>Construct</strong></td><td>Supervisor review, seed planning, hard judgment</td><td>A "Pro/Opus" tier when available</td></tr>
  </table>
  <p class="mb0" style="font-size:9pt;color:var(--ink-soft);margin-top:8px;">The models are swappable by env var — our own Claude tiers (Haiku → Sonnet → Opus) map cleanly onto Read → Reason → Construct.</p>
</section>

<!-- VERIFY / CUSTODY -->
<section class="section">
  <div class="eyebrow">04 · The quality machinery</div>
  <h2>How it polices its own work</h2>
  <p class="lead" style="margin:12px 0 13px;">This is the part most aligned with our biggest differentiator — the verify layer. The swarm treats <strong>"matter custody"</strong> as a first-class duty: preserving the integrity of every fact from source to final artifact.</p>

  <div class="grid-2">
    <div class="card flush">
      <h4>Signals &amp; gaps</h4>
      <p class="mb0" style="font-size:9.3pt;">Open questions ("signals") and explicit <strong>gap</strong> entries keep a running list of what's still unanswered. A worked banking example grew from <strong>7 entries to 2,400</strong> grounded findings over 12 iterations — a 343× expansion — with 135 gaps logged, not hidden.</p>
    </div>
    <div class="card flush">
      <h4>Debt sensors</h4>
      <p class="mb0" style="font-size:9.3pt;">Optional detectors flag specific failure modes: <strong>relation debt</strong> (a needed cross-document comparison wasn't done), <strong>authority debt</strong> (a claim lacks a citation), <strong>severity debt</strong> (a risk wasn't rated), <strong>source-object debt</strong> (an entity/population was missed).</p>
    </div>
  </div>

  <div class="card">
    <h4>The custody-break taxonomy <span class="muted" style="font-weight:400;font-size:8.5pt;">— a diagnostic vocabulary for failures</span></h4>
    <p class="mb0" style="font-size:9.3pt;">They classify <em>how</em> information gets lost between source and output across 12 named types — e.g. <span class="mono" style="font-size:8pt;">absent-state</span> (a fact never entered), <span class="mono" style="font-size:8pt;">unpromoted-fact</span> (extracted but never analyzed), <span class="mono" style="font-size:8pt;">lost-commitment</span> ("must calculate X" noted but never done), <span class="mono" style="font-size:8pt;">false-completion</span> (declared done with gaps open). Their own analysis: in nearly every near-miss, <strong>the right fact was already on the blackboard</strong> — the missing step was the final cross-reference or citation. That's a state-processing fix, not a model-intelligence ceiling.</p>
  </div>

  <div class="callout teal"><span class="lab">Concrete proof point — an M&amp;A task</span>On an antitrust merger-remedies comparison it passed <strong>56 of 61</strong> criteria — correctly extracting that a divestiture proposed transferring only <strong>14 FTEs vs ~85</strong> in precedent, a <strong>3-year supply agreement vs 5</strong>, an off-market <strong>4.5% royalty vs a 2–3% norm</strong>, and a monitoring-trustee conflict of interest — each cited to specific cases. On a credit-agreement-vs-commitment-letter comparison it scored a perfect <strong>40/40</strong>.</div>
</section>

<!-- MAPPING -->
<section class="section">
  <div class="eyebrow">05 · The fit</div>
  <h2>How it maps onto DealDiligence</h2>
  <p class="lead" style="margin:12px 0 13px;">Almost every stage of our pipeline has a richer counterpart in the swarm model. This is less "a new tool" and more "a more advanced version of our own architecture."</p>

  <table class="tbl">
    <tr><th>DealDiligence today</th><th>Swarm counterpart</th><th>Upgrade</th></tr>
    <tr><td>Per-document fact sheet (one Opus read)</td><td>Blackboard observations — typed, cited, confidence-scored</td><td class="win">Iterative &amp; gap-aware vs one-shot</td></tr>
    <tr><td>Reconciliation (single Sonnet pass, ≥2 docs)</td><td>Iterative cross-document convergence driven by signals</td><td class="win">Catches deviations one pass misses</td></tr>
    <tr><td>Anomaly detection (≥3 docs)</td><td>Relation-debt &amp; deviation analysis</td><td>The credit-agreement example <em>is</em> this</td></tr>
    <tr><td>Verify layer (citation check + Sonnet)</td><td>Matter custody + custody-break taxonomy + authority debt</td><td class="win">Deeper provenance &amp; fewer misses</td></tr>
    <tr><td>Deal brief (Sonnet synthesis)</td><td>Synthesis from curated state + "must-surface" policy</td><td>Values/contradictions never dropped</td></tr>
    <tr><td>Kanban risk report (Opus)</td><td>Swarm "draft / analyze" task (90%+ on draft)</td><td>Same job, cheaper &amp; auditable</td></tr>
    <tr><td>Planned pgvector retriever</td><td>MapU persistent memory (Postgres + pgvector)</td><td class="win">Already built, conflict-aware</td></tr>
    <tr><td>Opus-tier extraction cost (~70% of spend)</td><td>Flash/Haiku-Lite read cascade</td><td class="win">Large cost reduction</td></tr>
  </table>

  <div class="callout"><span class="lab">The one gap they haven't solved — that we also have</span>Their top open research question is <strong>cross-document entity resolution without LLM calls</strong> ("Acme Corp" vs "Acme Corporation") — which is precisely what our reconciliation's MasterEntity merge tackles. We are not behind here; if anything it's a place we could contribute or compare notes.</div>
</section>

<!-- IMPLEMENTATIONS -->
<section class="section">
  <div class="eyebrow">06 · What we could actually do</div>
  <h2>Potential implementations</h2>
  <p class="lead" style="margin:12px 0 14px;">Ranked roughly by effort-to-value. Each carries an effort and an impact rating.</p>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">1</div></div>
    <div class="impl-body">
      <h4>Pilot it via MCP <span class="pill lo">Effort: Low</span> <span class="pill hi">Signal: High</span></h4>
      <p class="mb0" style="font-size:9.4pt;">They ship an <strong>MCP server</strong> and DealDiligence is Claude-native — MCP is a first-class integration path. Wire the swarm in as a tool, point it at 2–3 real deals' document sets, and A/B its output against our current extraction + reconciliation. Fastest, cheapest way to validate the claims on <em>our</em> data before committing to anything. Configure its model env vars to use our Anthropic keys.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">2</div></div>
    <div class="impl-body">
      <h4>Adopt the blackboard for reconciliation <span class="pill md">Effort: Med</span> <span class="pill hi">Impact: High</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Replace our single-pass reconciliation with an iterative, gap-driven loop over a typed blackboard. Our cross-document deviation detection (the heart of diligence) gets materially stronger — the merger-remedies and credit-agreement examples show the depth a converging loop reaches versus one shot. Keep our existing fact sheets as the seed observations.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">3</div></div>
    <div class="impl-body">
      <h4>Cut extraction cost with a cheap-model cascade <span class="pill md">Effort: Med</span> <span class="pill hi">Impact: High</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Extraction is our biggest cost line (~70%). The swarm's core claim is that architecture, not model size, drives quality — cheap readers + coordination beat lone frontier models. Moving first-pass reading from Opus onto a Haiku/Flash-Lite cascade, with the swarm recovering quality, directly attacks our unit economics. Validate against our verify layer to confirm no accuracy loss.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">4</div></div>
    <div class="impl-body">
      <h4>Persistent matter memory (MapU) <span class="pill md">Effort: Med</span> <span class="pill hi">Impact: High (strategic)</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Adopt MapU-style persistent, conflict-aware state so the 10th question on a deal costs a fraction of the first, and a new document reconciles <em>incrementally</em> against existing understanding rather than triggering a full rebuild. This is the "pgvector retriever" already on our roadmap — built, and with provenance + supersession baked in.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">5</div></div>
    <div class="impl-body">
      <h4>Harden our verify layer with debt sensors <span class="pill md">Effort: Med</span> <span class="pill md">Impact: Med</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Port the custody-break taxonomy and authority/relation debt checks into our verification step to cut "needs review" misses — the cases where the fact was found but the cross-reference or citation wasn't made. Strengthens the SOC 2 / regulated-buyer story that is core to our positioning.</p>
    </div>
  </div>

  <div class="impl">
    <div class="impl-rail"><div class="impl-badge">6</div></div>
    <div class="impl-body">
      <h4>Hierarchical retrieval (Fractal Embeddings) <span class="pill hi">Effort: High</span> <span class="pill md">Impact: Med</span></h4>
      <p class="mb0" style="font-size:9.4pt;">Longer-horizon: embeddings that natively understand "this SOFR-floor clause lives in a credit-agreement section, in a banking deal" improve cross-reference detection — exactly where near-misses happen. Pairs with our eventual move off the stuff-everything retriever.</p>
    </div>
  </div>
</section>

<!-- ENGAGEMENT + RISKS -->
<section class="section">
  <div class="eyebrow">07 · The honest assessment</div>
  <h2>Engagement options &amp; risks</h2>

  <div class="grid-3" style="margin:14px 0;">
    <div class="card flush">
      <h4 style="font-size:10.5pt;">Adopt the code</h4>
      <p class="mb0" style="font-size:9pt;">MIT license — use the swarm engine and MapU directly, no contract. Lowest friction, full control, but we own the integration and maintenance.</p>
    </div>
    <div class="card flush">
      <h4 style="font-size:10.5pt;">Partner with Iqidis</h4>
      <p class="mb0" style="font-size:9pt;">Their commercial Irys adds citation-vs-50M-opinions and matter management. But Irys is a <em>legal-AI product</em> in an adjacent lane — partner vs. competitor needs judgment.</p>
    </div>
    <div class="card flush">
      <h4 style="font-size:10.5pt;">Talent channel</h4>
      <p class="mb0" style="font-size:9pt;">Active team, public contact, bounty program. A pragmatic way to engage the authors or recruit the expertise if we build our own.</p>
    </div>
  </div>

  <h3 style="margin-bottom:8px;">Risks &amp; caveats — read before betting on it</h3>
  <ul class="clean">
    <li><strong>Early-stage by their own admission.</strong> The design doc is labeled <span class="mono" style="font-size:8pt;">"PHASE 0 READY; FULL DESIGN UNPROVEN."</span> The debt sensors default <strong>off</strong> and their precision/recall are explicitly <em>unvalidated</em>. The advanced custody machinery is largely roadmap, not shipped.</li>
    <li><strong>Confidence scores aren't calibrated.</strong> They state plainly that confidence values are model heuristics, not probabilities — don't build reliability claims on them.</li>
    <li><strong>A known architectural hole.</strong> "Late-lifecycle mutation": sensors can add findings <em>after</em> the convergence check, so the approved state can be stale at synthesis. Documented, not yet fixed.</li>
    <li><strong>Entity resolution isn't solved</strong> — it's their #1 open question. Their near-misses repeatedly stem from un-reconciled duplicate entities, the same problem our reconciliation addresses.</li>
    <li><strong>Benchmark fine print.</strong> Run on the <em>public</em> Harvey set (not Harvey's private holdout) and judged with a Gemini model rather than the recommended Sonnet (they report ~90% agreement). Impressive and transparent, but not an apples-to-apples Harvey comparison.</li>
    <li><strong>Gemini-centric defaults.</strong> Anthropic is supported, but the tuning and benchmarks are Gemini-Flash-based; expect calibration work to hit parity on Claude.</li>
  </ul>

  <div class="callout teal" style="margin-top:6px;"><span class="lab">Recommendation</span>Treat it as a <strong>high-potential reference architecture, not a turnkey dependency.</strong> Run the low-cost MCP pilot on real deals to validate on our data. If it holds up, the blackboard-driven reconciliation and persistent matter memory are the two ideas most likely to move our accuracy and cost at once. Keep Iqidis on the radar as both a partnership option and a competitive datapoint — and don't confuse them with the blockchain "Irys."</div>

  <p style="font-size:8.6pt;color:var(--ink-soft);margin-top:12px;">Sources: the project README, <span class="path" style="font-size:7.4pt;">docs/SWARM_INTELLIGENCE.md</span>, source (<span class="path" style="font-size:7.4pt;">src/swarm/</span>, <span class="path" style="font-size:7.4pt;">.mcp.json</span>, <span class="path" style="font-size:7.4pt;">pyproject.toml</span>), and the included M&amp;A example outputs — github.com/dl1683/irys-stateful-swarms. Company 2 of 2 to follow.</p>
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

const coverPdf = join(__dirname, '_tb_cover.pdf');
const bodyPdf = join(__dirname, '_tb_body.pdf');
const finalPdf = join(__dirname, 'DealDiligence-TechBrief-1-Stateful-Swarms.pdf');

writeFileSync(join(__dirname, 'tech-brief-1.html'), bodyHTML);
await render(coverHTML, coverPdf, { format: 'Letter', preferCSSPageSize: true });
await render(bodyHTML, bodyPdf, {
  format: 'Letter',
  margin: { top: '0.78in', bottom: '0.62in', left: '0.7in', right: '0.7in' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:8px;font-family:monospace;color:#9a8f7a;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;letter-spacing:.08em;"><span style="color:#8f6a2c;font-weight:bold;">DEALDILIGENCE.AI</span><span>TECHNOLOGY BRIEF · STATEFUL SWARMS</span></div>`,
  footerTemplate: `<div style="font-size:8px;font-family:monospace;color:#9a8f7a;width:100%;padding:0 0.7in;text-align:right;">p.<span class="pageNumber"></span></div>`,
});
await browser.close();

execSync(`gs -dNOPAUSE -dBATCH -dQUIET -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -sOutputFile="${finalPdf}" "${coverPdf}" "${bodyPdf}"`);
rmSync(coverPdf); rmSync(bodyPdf);
console.log('Built: ' + finalPdf);
