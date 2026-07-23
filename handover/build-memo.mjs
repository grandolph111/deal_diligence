import puppeteer from '../frontend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#152238; --ink-2:#1f3253; --ink-soft:#46556e;
    --brass:#b8893f; --brass-deep:#8f6a2c;
    --paper:#faf7f1; --paper-2:#f3eee3; --line:#e4dccd; --teal:#2c6e6a;
    --green:#3f7d54; --red:#b1493e;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  @page{ size:Letter; margin:0; }
  body{ font-family:'Inter',sans-serif; color:#1c2740; background:var(--paper); -webkit-font-smoothing:antialiased; }
  .page{ width:8.5in; height:11in; padding:0.7in 0.75in 0.6in; position:relative; overflow:hidden; }
  .page::before{ content:""; position:absolute; inset:0;
    background:radial-gradient(120% 70% at 0% 0%, rgba(184,137,63,.05), transparent 50%),
               radial-gradient(100% 60% at 100% 100%, rgba(44,110,106,.045), transparent 55%); }
  .page>*{ position:relative; z-index:1; }
  h1,h2,h3,h4{ font-family:'Fraunces',Georgia,serif; color:var(--ink); margin:0; font-weight:600; }
  p{ margin:0 0 7px; }
  strong{ color:var(--ink); font-weight:600; }
  .mono{ font-family:'IBM Plex Mono',monospace; }
  .muted{ color:var(--ink-soft); }

  /* letterhead */
  .head{ display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--ink); padding-bottom:11px; }
  .logo{ display:flex; align-items:center; gap:10px; }
  .lmark{ width:30px; height:30px; border-radius:7px; background:linear-gradient(150deg,var(--brass),var(--brass-deep));
    display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; font-weight:700; font-size:14pt; color:#101b2e; }
  .lword{ font-family:'Fraunces',serif; font-size:12pt; font-weight:600; color:var(--ink); }
  .lword b{ color:var(--brass-deep); }
  .memotag{ font-family:'IBM Plex Mono',monospace; font-size:8pt; letter-spacing:.2em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; }

  .title{ font-size:25pt; letter-spacing:-0.02em; line-height:1.02; margin:16px 0 9px; }
  .title .accent{ color:var(--brass); font-style:italic; }

  .meta{ display:flex; gap:26px; font-size:8.4pt; margin-bottom:13px; flex-wrap:wrap; }
  .meta .k{ font-family:'IBM Plex Mono',monospace; letter-spacing:.12em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; margin-right:6px; }
  .meta .v{ color:var(--ink); font-weight:500; }

  .lead{ font-size:10pt; line-height:1.55; color:var(--ink-soft); margin-bottom:12px; }

  .rec{ background:linear-gradient(150deg,#182a47,#101b2e); color:#e9e2d2; border-radius:11px; padding:15px 18px; margin-bottom:13px; }
  .rec .lab{ font-family:'IBM Plex Mono',monospace; font-size:7.4pt; letter-spacing:.16em; text-transform:uppercase; color:var(--brass); font-weight:600; display:block; margin-bottom:8px; }
  .rec ol{ margin:0; padding-left:0; list-style:none; counter-reset:r; }
  .rec li{ position:relative; padding-left:30px; margin-bottom:8px; font-size:9.4pt; line-height:1.45; color:#dfe5ee; counter-increment:r; }
  .rec li:last-child{ margin-bottom:0; }
  .rec li::before{ content:counter(r); position:absolute; left:0; top:0; width:19px; height:19px; border-radius:6px;
    background:rgba(184,137,63,.22); color:var(--brass); font-family:'Fraunces',serif; font-weight:600; font-size:10pt;
    display:flex; align-items:center; justify-content:center; }
  .rec li b{ color:#fff; }

  .cols{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:13px; }
  .vcard{ background:#fffdf8; border:1px solid var(--line); border-radius:10px; padding:12px 14px; box-shadow:0 12px 26px -20px rgba(21,34,56,.3); }
  .vcard h3{ font-size:12.5pt; display:flex; align-items:center; gap:7px; margin-bottom:2px; }
  .vcard .sub{ font-size:8pt; color:var(--ink-soft); margin-bottom:8px; }
  .vcard .row{ display:flex; gap:7px; font-size:8.5pt; padding:3px 0; border-top:1px solid var(--line); line-height:1.35; }
  .vcard .row:first-of-type{ border-top:none; }
  .vcard .rk{ font-family:'IBM Plex Mono',monospace; font-size:6.8pt; letter-spacing:.08em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; flex:0 0 64px; padding-top:1px; }
  .vcard .rv{ color:var(--ink); flex:1; }
  .dot{ width:8px; height:8px; border-radius:50%; display:inline-block; }
  .lead-pick{ font-family:'IBM Plex Mono',monospace; font-size:6.6pt; letter-spacing:.1em; text-transform:uppercase; font-weight:600;
    padding:2px 7px; border-radius:20px; }
  .lp-strat{ background:#eef0f4; color:#33425e; border:1px solid #cfd8e4; }
  .lp-now{ background:#e7f0ea; color:#2f6242; border:1px solid #c3ddcb; }

  .callout{ border-left:3px solid var(--teal); background:linear-gradient(90deg, rgba(44,110,106,.08), rgba(44,110,106,.01));
    padding:11px 14px; border-radius:0 8px 8px 0; margin-bottom:12px; font-size:9.1pt; line-height:1.5; }
  .callout .lab{ font-family:'IBM Plex Mono',monospace; font-size:7.2pt; letter-spacing:.15em; text-transform:uppercase; color:var(--teal); font-weight:600; display:block; margin-bottom:3px; }

  .next{ display:flex; gap:12px; margin-bottom:10px; }
  .next .n{ flex:1; background:#fffdf8; border:1px solid var(--line); border-left:3px solid var(--brass); border-radius:8px; padding:9px 12px; }
  .next .nt{ font-family:'IBM Plex Mono',monospace; font-size:6.8pt; letter-spacing:.12em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; margin-bottom:3px; }
  .next .nb{ font-size:8.6pt; line-height:1.4; color:var(--ink); }

  .foot{ position:absolute; bottom:0.5in; left:0.75in; right:0.75in; border-top:1px solid var(--line); padding-top:7px;
    display:flex; justify-content:space-between; font-family:'IBM Plex Mono',monospace; font-size:7pt; letter-spacing:.06em; color:#9a8f7a; }
  .foot b{ color:var(--brass-deep); }
</style></head>
<body><div class="page">

  <div class="head">
    <div class="logo"><div class="lmark">D</div><div class="lword">Deal<b>Diligence</b>.ai</div></div>
    <div class="memotag">Internal Memo · Confidential</div>
  </div>

  <div class="title">Two diligence-AI vendors:<br>a <span class="accent">recommendation</span></div>

  <div class="meta">
    <div><span class="k">To</span><span class="v">Leadership</span></div>
    <div><span class="k">From</span><span class="v">Engineering</span></div>
    <div><span class="k">Re</span><span class="v">Stateful Swarms (Iqidis) &amp; Isaacus</span></div>
    <div><span class="k">Date</span><span class="v">13 Jun 2026</span></div>
  </div>

  <p class="lead">We evaluated two companies that could strengthen our document pipeline. They sit at <strong>different layers</strong> and are not an either/or: <strong>Stateful Swarms</strong> is an orchestration architecture (the reasoning "brain"); <strong>Isaacus</strong> is specialized legal infrastructure (retrieval &amp; classification plumbing). Full detail is in the two attached briefs — this page is the decision.</p>

  <div class="rec">
    <span class="lab">Recommendation</span>
    <ol>
      <li><b>Pilot Stateful Swarms as the strategic bet — run it on Claude.</b> The engine is model-agnostic; our Haiku→Sonnet→Opus tiers map onto its read→reason→construct stages, so we gain the stateful architecture without leaving Claude. Start with a low-cost MCP pilot on 2–3 real deals.</li>
      <li><b>Adopt the one Isaacus piece Claude cannot do — legal embeddings for retrieval.</b> Claude has no embedding model; this layer was always going to be a specialist. Drop Kanon&nbsp;2 Embedder into our planned vector retriever.</li>
      <li><b>Keep Isaacus out of the reasoning layer for now.</b> Use its classifier only as a cheap cross-check — Claude stays the primary, verified extractor.</li>
    </ol>
  </div>

  <div class="cols">
    <div class="vcard">
      <h3><span class="dot" style="background:var(--teal)"></span>Stateful Swarms <span class="lead-pick lp-strat">Lead bet</span></h3>
      <div class="sub">Iqidis · MIT open source · the "brain"</div>
      <div class="row"><span class="rk">Upside</span><span class="rv">Statefulness, ~40× cheaper analysis, deeper cross-doc reasoning</span></div>
      <div class="row"><span class="rk">Maturity</span><span class="rv">Early — "Phase 0, unproven"; needs integration work</span></div>
      <div class="row"><span class="rk">Models</span><span class="rv">Any provider — <strong>run on Claude</strong> to keep our quality bar</span></div>
      <div class="row"><span class="rk">Our move</span><span class="rv">MCP pilot on real deals; measure vs current pipeline</span></div>
    </div>
    <div class="vcard">
      <h3><span class="dot" style="background:var(--brass)"></span>Isaacus <span class="lead-pick lp-now">Adopt narrow</span></h3>
      <div class="sub">Legal models · commercial API · the plumbing</div>
      <div class="row"><span class="rk">Upside</span><span class="rv">#1 legal retrieval; cheap, fast, SOC/ISO/IRAP, self-host</span></div>
      <div class="row"><span class="rk">Maturity</span><span class="rv">Production — Microsoft, IBM, World Bank customers</span></div>
      <div class="row"><span class="rk">Models</span><span class="rv">Narrow by design — feeds Claude, doesn't replace it</span></div>
      <div class="row"><span class="rk">Our move</span><span class="rv">Embedder → vector retriever (already in our roadmap)</span></div>
    </div>
  </div>

  <div class="callout">
    <span class="lab">Addressing the main concern — "non-Claude models may be less accurate"</span>
    Valid for <em>reasoning</em>, not for <em>retrieval</em>. Claude makes no embedding model — so semantic search was never "Isaacus vs Claude," it's Isaacus vs Voyage/OpenAI, where Isaacus wins on legal text and runs faster and cheaper. A narrow embedder there is the <strong>right</strong> tool; it hands Claude better context rather than competing with its judgment. The genuine risk — a non-Claude model making analytical calls — we avoid by keeping Claude as the extractor and limiting Isaacus to retrieval.
  </div>

  <div class="next">
    <div class="n"><div class="nt">Decision needed</div><div class="nb">Approve a time-boxed Stateful Swarms MCP pilot (run on Claude) on 2–3 representative deals.</div></div>
    <div class="n"><div class="nt">Parallel, low-risk</div><div class="nb">Green-light the Kanon 2 Embedder retriever — a contained, roadmap-aligned upgrade.</div></div>
  </div>

  <div class="foot">
    <span>Attachments: <b>Tech Brief 1</b> — Stateful Swarms · <b>Tech Brief 2</b> — Isaacus</span>
    <span>DealDiligence.ai</span>
  </div>

</div></body></html>`;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 900));
const out = join(__dirname, 'DealDiligence-Vendor-Memo.pdf');
await page.pdf({ path: out, printBackground: true, format: 'Letter', preferCSSPageSize: true });
await browser.close();
console.log('Built: ' + out);
