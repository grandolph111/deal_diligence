import puppeteer from '../frontend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(readFileSync(join(__dirname, 'prompts.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const code = (s) => `<pre class="code">${esc(s)}</pre>`;
const codeLabel = (label, s) => `<div class="codewrap"><div class="codehead">${label}</div>${code(s)}</div>`;

const sp = P.systemPrompts;
const ex = P.extraction;

// ---- user-message templates (verbatim from the runner files) ----
const U = {
  classify: `Filename: <filename>\n\nClassify this document.`,
  extract: `Filename: <filename>\n\nExtract the document into the submit_extraction tool call.`,
  extractCorrection: `Filename: <filename>\n\nYou previously extracted this document. A verifier flagged the following issues:\n<verifier issues>\n\nRe-extract the document, correcting these issues. Use the same JSON tool call schema.`,
  verify: `Filename: <filename>\nDocument type (as classified): <type>\n\n# Fact sheet to verify\n\n<fact sheet markdown>\n\n# Extracted clauses (for page/quote verification)\n\n<numbered clause list: clauseType, page, risk, quote>\n\nVerify this fact sheet against the PDF above. Flag every hallucination or error you find.`,
  reconcile: `# Fact sheets for this deal\n\n<document blocks: <document documentId="…" name="…"> … </document>>\n\nReconcile into the submit_reconciliation tool.`,
  anomaly: `Scope: <scope label>\nDocument count: <n>\n\n# Fact sheets to compare\n\n<document blocks>\n\nIdentify every outlier vs. peers.`,
  dealBrief: `Project: <project name>\nScope: <scope label>\nDocument count: <n>\n\n[block 2, cached]  # Master entities summary …\n[block 3, cached]  <playbook> … </playbook>\n[block 4]          # In-scope document fact sheets  <document blocks>`,
  riskReport: `[block 1, cached]  # Deal Brief  <brief markdown>\n[block 2, cached]  # Pinned document fact sheets  <document blocks>\n[block 3]          # User prompt  <user's task prompt>  +  Model ID for the report header: <model>`,
  chat: `[block 1, cached]  # Deal Brief  <brief markdown>\n[block 2, cached]  # Pinned document fact sheets  <document blocks>   (only if user pinned docs)\n[handshake]        assistant acks "Ready." via submit_chat, then conversation history\n[final]            <user's message>`,
};

const onebadge = (tier) => {
  const m = { Haiku: 'haiku', Sonnet: 'sonnet', Opus: 'opus' };
  return `<span class="tag ${m[tier]}">${tier}</span>`;
};
const badge = (tier) =>
  tier.includes('/')
    ? tier.split('/').map((t) => onebadge(t.trim())).join(' ')
    : onebadge(tier.trim());

// ---- section metadata, in pipeline order ----
const sections = [
  {
    n: '01', title: 'Document Classification', tier: 'Haiku',
    tool: 'submit_classification',
    files: ['prompts/classify.ts', 'classify.ts'],
    when: 'Every upload — reads only the first 2 pages to guess the document type cheaply.',
    sys: sp.classify, user: U.classify,
    userNote: 'The first 2 pages of the PDF are attached as a native document block alongside this text.',
  },
  {
    n: '02', title: 'Document Extraction', tier: 'Haiku / Sonnet / Opus',
    tool: 'submit_extraction',
    files: ['prompts/extraction/shared.ts', 'few-shot.ts', 'types.ts', 'index.ts', 'extract.ts'],
    when: 'Once per document, on the model chosen by the size + type router. This is the careful first read that produces the fact sheet.',
    extraction: true,
    user: U.extract, userCorrection: U.extractCorrection,
    userNote: 'The full PDF is attached as a native document block (cached). The system prompt is composed as: SHARED PREAMBLE + FEW-SHOT EXAMPLES + TYPE BLOCK + PLAYBOOK BLOCK.',
  },
  {
    n: '03', title: 'Extraction Verification', tier: 'Sonnet',
    tool: 'submit_verification',
    files: ['prompts/verify.ts', 'verify.ts'],
    when: 'After every extraction — a second, independent model re-reads the PDF against the fact sheet and can return a corrected version.',
    sys: sp.verify, user: U.verify,
    userNote: 'The original PDF is attached (cached) so the verifier checks quotes and pages against the real source.',
  },
  {
    n: '04', title: 'Entity Reconciliation', tier: 'Sonnet',
    tool: 'submit_reconciliation',
    files: ['prompts/reconciliation.ts', 'reconcile.ts'],
    when: 'When a deal has ≥ 2 documents, ~30s after uploads settle. Merges duplicate parties and finds cross-document relationships.',
    sys: sp.reconciliation, user: U.reconcile,
  },
  {
    n: '05', title: 'Anomaly Detection', tier: 'Sonnet',
    tool: 'submit_anomalies',
    files: ['prompts/reconciliation.ts', 'anomaly.ts'],
    when: 'When a deal has ≥ 3 comparable documents. Flags clause values that are outliers versus their peer group.',
    sys: sp.anomaly, user: U.anomaly,
  },
  {
    n: '06', title: 'Deal Brief', tier: 'Sonnet',
    tool: 'submit_brief',
    files: ['prompts/deal-brief.ts', 'deal-brief.ts'],
    when: 'Once per distinct access scope, during reconciliation. Synthesizes all in-scope fact sheets into one living brief.',
    sys: sp.dealBrief, user: U.dealBrief,
    userNote: 'Sent as four content blocks; the master-entities summary and playbook are cached. Human-edited sections are spliced back in afterward, outside the model call.',
  },
  {
    n: '07', title: 'Risk Report — Kanban AI Task', tier: 'Opus',
    tool: 'submit_report',
    files: ['prompts/riskReport.ts', 'riskReport.ts'],
    when: "When a task card with a prompt + attached documents is dragged into progress. Drafts a reviewable risk memo.",
    sys: sp.riskReport, user: U.riskReport,
    userNote: 'The deal brief and pinned fact sheets are cached so repeat runs within the cache window are cheap.',
  },
  {
    n: '08', title: 'VDR Chat', tier: 'Haiku',
    tool: 'submit_chat',
    files: ['prompts/chat.ts', 'chat.ts'],
    when: 'Every chat message inside a deal. Answers from the user’s scoped brief (+ optional pinned docs) with citations.',
    sys: sp.chat, user: U.chat,
    userNote: 'A priming handshake loads the brief and pinned docs (cached), the model acknowledges, then the real conversation follows.',
  },
];

// ---- extraction section body (special: shows the composed pieces) ----
const TYPE_ORDER = ['SPA', 'APA', 'LOI', 'NDA', 'EMPLOYMENT', 'LEASE', 'FINANCIAL', 'CORPORATE', 'GENERIC'];
function extractionBody() {
  const typeBlocks = TYPE_ORDER
    .map((t) => codeLabel(`TYPE BLOCK · ${t}`, ex.typeBlocks[t]))
    .join('');
  return `
    <div class="piece"><h4>Part A — Shared preamble <span class="muted">(cached · same for every extraction)</span></h4>
      ${code(ex.sharedPreamble)}</div>
    <div class="piece"><h4>Part B — Few-shot examples <span class="muted">(cached)</span></h4>
      ${code(ex.fewShot)}</div>
    <div class="piece"><h4>Part C — Type block <span class="muted">(one of these is appended, by document type)</span></h4>
      ${typeBlocks}</div>
    <div class="piece"><h4>Part D — Playbook block <span class="muted">(appended only if the project has a playbook)</span></h4>
      ${code(`<playbook>\n# Playbook (customer's preferred positions for this deal)\n\n## Deal context\n<free text>\n\n## Red flags (force HIGH on any match)\n- <red flag>\n\n## Standard positions\n### <CLAUSE_TYPE>\n**Preferred:** <language>\n**Fallbacks:** "<a>" | "<b>"\n**Risk if deviates:** <LOW|MEDIUM|HIGH>\n_Notes:_ <notes>\n</playbook>`)}</div>
    <div class="piece"><h4>User message — normal pass</h4>${code(U.extract)}</div>
    <div class="piece"><h4>User message — re-extraction after the verifier finds issues</h4>${code(U.extractCorrection)}</div>
  `;
}

function sectionHTML(s) {
  const filechips = s.files.map((f) => `<span class="path">${esc(f)}</span>`).join(' ');
  let body;
  if (s.extraction) {
    body = extractionBody();
  } else {
    body = `
      ${codeLabel('SYSTEM PROMPT', s.sys)}
      <div class="piece"><h4>User message / assembled context</h4>
        ${s.userNote ? `<p class="note">${s.userNote}</p>` : ''}
        ${code(s.user)}</div>`;
  }
  return `
  <section class="section">
    <div class="sec-head">
      <div class="sec-top">
        <span class="sec-num">${s.n}</span>
        <h2>${s.title}</h2>
        <span class="badges">${badge(s.tier)}</span>
      </div>
      <div class="sec-meta">
        <div><span class="k">Model</span><span class="v">${esc(s.tier)}</span></div>
        <div><span class="k">Tool call</span><span class="v mono">${esc(s.tool)}</span></div>
        <div><span class="k">Source</span><span class="v">${filechips}</span></div>
      </div>
      <p class="when"><span class="k">When it runs</span> ${esc(s.when)}</p>
    </div>
    ${body}
  </section>`;
}

const bodyInner = sections.map(sectionHTML).join('\n');

// ===================== STYLES =====================
const STYLE = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#152238; --ink-2:#1f3253; --ink-soft:#46556e;
    --brass:#b8893f; --brass-deep:#8f6a2c;
    --paper:#faf7f1; --paper-2:#f3eee3; --line:#e4dccd; --teal:#2c6e6a;
    --code-bg:#fbf8f1; --code-line:#e7decd;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{ font-family:'Inter',sans-serif; color:#1c2740; background:var(--paper);
        font-size:10pt; line-height:1.62; -webkit-font-smoothing:antialiased; }
  h1,h2,h3,h4{ font-family:'Fraunces',Georgia,serif; color:var(--ink); margin:0; font-weight:600; }
  .mono{ font-family:'IBM Plex Mono',monospace; }
  p{ margin:0 0 8px; }

  /* section */
  .section{ page-break-before:always; }
  .sec-head{ break-inside:avoid; break-after:avoid; margin-bottom:14px;
             border-bottom:2px solid var(--ink); padding-bottom:12px; }
  .sec-top{ display:flex; align-items:center; gap:12px; }
  .sec-num{ font-family:'IBM Plex Mono',monospace; font-size:10pt; font-weight:600;
            color:#fff; background:var(--ink); border-radius:6px; padding:3px 9px; letter-spacing:.05em; }
  .sec-top h2{ font-size:20pt; letter-spacing:-0.02em; flex:1; line-height:1.05; }
  .sec-meta{ display:flex; gap:26px; flex-wrap:wrap; margin-top:12px; }
  .sec-meta .k, .when .k{ display:block; font-family:'IBM Plex Mono',monospace; font-size:7pt;
            letter-spacing:.14em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; margin-bottom:2px; }
  .sec-meta .v{ font-size:9.5pt; color:var(--ink); font-weight:500; }
  .when{ margin-top:11px; font-size:9.3pt; color:var(--ink-soft); }
  .when .k{ display:inline; margin-right:6px; }

  .tag{ display:inline-block; font-family:'IBM Plex Mono',monospace; font-size:7.4pt; font-weight:600;
        letter-spacing:.04em; padding:2px 9px; border-radius:20px; }
  .tag.haiku{ background:#e6f0ef; color:#235c58; border:1px solid #bcd8d5; }
  .tag.sonnet{ background:#efe7f3; color:#6b3f7c; border:1px solid #d9c4e1; }
  .tag.opus{ background:#f7ead7; color:#8a5e1f; border:1px solid #e8d2ad; }

  .path{ font-family:'IBM Plex Mono',monospace; font-size:7.7pt; background:var(--ink);
         color:#e9e2d2; padding:1px 6px; border-radius:4px; white-space:nowrap; }

  /* code */
  .codewrap{ margin:0 0 12px; }
  .codehead{ font-family:'IBM Plex Mono',monospace; font-size:7.2pt; letter-spacing:.13em;
             text-transform:uppercase; color:var(--brass-deep); font-weight:600; margin:14px 0 4px; }
  pre.code{ font-family:'IBM Plex Mono',monospace; font-size:7.6pt; line-height:1.5;
            white-space:pre-wrap; word-break:break-word; margin:0;
            background:var(--code-bg); border:1px solid var(--code-line); border-left:3px solid var(--brass);
            border-radius:7px; padding:11px 13px; color:#23303f; }
  .piece{ margin-bottom:6px; }
  .piece h4{ font-size:11pt; margin:16px 0 5px; color:var(--ink); break-after:avoid; }
  .piece h4 .muted, .muted{ font-family:'Inter',sans-serif; font-weight:400; font-size:8.5pt; color:var(--ink-soft); }
  .note{ font-size:8.8pt; color:var(--ink-soft); margin:0 0 6px; padding-left:11px; border-left:2px solid var(--line); }

  /* legend page */
  .legend h2{ font-size:23pt; letter-spacing:-0.02em; }
  .legend .lead{ font-size:11.5pt; color:var(--ink-soft); line-height:1.6; }
  table.tbl{ width:100%; border-collapse:collapse; font-size:8.7pt; margin:6px 0; }
  table.tbl th{ text-align:left; font-family:'IBM Plex Mono',monospace; font-size:7.2pt; letter-spacing:.1em;
        text-transform:uppercase; color:var(--ink-soft); border-bottom:2px solid var(--line); padding:6px 8px; }
  table.tbl td{ padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  .mech{ background:#fffdf8; border:1px solid var(--line); border-left:3px solid var(--teal);
         border-radius:8px; padding:13px 16px; margin:10px 0; font-size:9.2pt; }
  .mech b{ color:var(--ink); }
</style>`;

// ===================== LEGEND (first body page) =====================
const legend = `
<section class="legend">
  <div style="font-family:'IBM Plex Mono',monospace; font-size:8pt; letter-spacing:.22em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; margin-bottom:12px;">How to read this reference</div>
  <h2>Every place Claude is told what to do</h2>
  <p class="lead">This document reproduces, <b>verbatim from the source code</b>, every system prompt the platform sends to Claude, plus the user-message templates that wrap them. They are ordered to follow the document pipeline. Angle-bracket placeholders like <span class="mono">&lt;filename&gt;</span> mark values filled in at runtime.</p>

  <table class="tbl">
    <tr><th>#</th><th>Touchpoint</th><th>Model</th><th>Tool call</th><th>Runs when</th></tr>
    <tr><td>01</td><td>Document Classification</td><td>Haiku</td><td class="mono">submit_classification</td><td>Every upload (first 2 pages)</td></tr>
    <tr><td>02</td><td>Document Extraction</td><td>Haiku/Sonnet/Opus</td><td class="mono">submit_extraction</td><td>Once per document</td></tr>
    <tr><td>03</td><td>Extraction Verification</td><td>Sonnet</td><td class="mono">submit_verification</td><td>After every extraction</td></tr>
    <tr><td>04</td><td>Entity Reconciliation</td><td>Sonnet</td><td class="mono">submit_reconciliation</td><td>≥2 docs, debounced 30s</td></tr>
    <tr><td>05</td><td>Anomaly Detection</td><td>Sonnet</td><td class="mono">submit_anomalies</td><td>≥3 docs, debounced</td></tr>
    <tr><td>06</td><td>Deal Brief</td><td>Sonnet</td><td class="mono">submit_brief</td><td>Per scope, debounced</td></tr>
    <tr><td>07</td><td>Risk Report (Kanban)</td><td>Opus</td><td class="mono">submit_report</td><td>Task card → in progress</td></tr>
    <tr><td>08</td><td>VDR Chat</td><td>Haiku</td><td class="mono">submit_chat</td><td>Each chat message</td></tr>
  </table>

  <h3 style="font-size:13pt; margin:18px 0 8px;">Three mechanics shared by every call</h3>
  <div class="mech"><b>Forced tool use.</b> Each call sets <span class="mono">tool_choice</span> to the named tool, so Claude must reply with structured JSON matching a schema — never free prose. The validated tool input is the return value.</div>
  <div class="mech"><b>Prompt caching.</b> Stable blocks (the ~4k-token extraction rulebook, the deal brief, attached fact sheets, the source PDF during verify) are marked <span class="mono">cache_control: ephemeral</span> for a 90% discount on re-reads within a 5-minute window.</div>
  <div class="mech"><b>Rate-limit resilience.</b> A shared <span class="mono">runToolUse()</span> wrapper handles HTTP 429s — it reads the <span class="mono">retry-after</span> header, waits, and retries once before failing.</div>
  <p style="font-size:8.4pt; color:var(--ink-soft); margin-top:14px;">Reproduced from <span class="path" style="font-size:7.2pt;">backend/src/integrations/claude/</span> — system prompts are exact; user-message blocks show the template with runtime values as placeholders.</p>
</section>`;

const bodyHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">${STYLE}</head>
<body>${legend}${bodyInner}</body></html>`;

// ===================== COVER =====================
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
  .cover h1{ color:#fff; font-size:50pt; line-height:0.99; letter-spacing:-0.03em; margin:0 0 18px; }
  .cover h1 .accent{ color:var(--brass); font-style:italic; }
  .csub{ font-size:13.5pt; line-height:1.5; color:#c9d3e0; max-width:5.9in; }
  .crule{ width:64px; height:3px; background:var(--brass); margin:24px 0; border-radius:2px; }
  .cmeta{ display:flex; gap:40px; }
  .cmeta .k{ font-family:'IBM Plex Mono',monospace; font-size:7.5pt; letter-spacing:.18em; text-transform:uppercase; color:#7e90ab; margin-bottom:4px; }
  .cmeta .v{ font-size:11pt; color:#eee7d8; font-weight:500; }
  .cfoot{ display:flex; justify-content:space-between; color:#7e90ab; font-family:'IBM Plex Mono',monospace; font-size:8pt; }
</style></head>
<body><div class="cover">
  <div class="ctop">
    <div class="logo"><div class="lmark">D</div><div class="lword">Deal<b>Diligence</b>.ai</div></div>
    <div class="ctag">Confidential · Internal</div>
  </div>
  <div>
    <div class="ceye">Engineering Reference</div>
    <h1>The Claude<br><span class="accent">Prompt</span> Book</h1>
    <div class="csub">Every system prompt and instruction the platform sends to Claude — reproduced verbatim from the source code, ordered along the document pipeline.</div>
    <div class="crule"></div>
    <div class="cmeta">
      <div><div class="k">Touchpoints</div><div class="v">8 Claude calls</div></div>
      <div><div class="k">Models</div><div class="v">Haiku · Sonnet · Opus</div></div>
      <div><div class="k">Source</div><div class="v">integrations/claude</div></div>
    </div>
  </div>
  <div class="cfoot"><span>Companion to the Codebase Walkthrough</span><span>Generated from source</span></div>
</div></body></html>`;

// ===================== RENDER =====================
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function render(html, out, opts) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.pdf({ path: out, printBackground: true, ...opts });
  await page.close();
}

const coverPdf = join(__dirname, '_cover.pdf');
const bodyPdf = join(__dirname, '_body.pdf');
const finalPdf = join(__dirname, 'DealDiligence-Claude-Prompt-Book.pdf');

writeFileSync(join(__dirname, 'prompt-reference.html'), bodyHTML);

await render(coverHTML, coverPdf, { format: 'Letter', preferCSSPageSize: true });
await render(bodyHTML, bodyPdf, {
  format: 'Letter',
  margin: { top: '0.78in', bottom: '0.62in', left: '0.7in', right: '0.7in' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:8px;font-family:monospace;color:#9a8f7a;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;letter-spacing:.08em;"><span style="color:#8f6a2c;font-weight:bold;">DEALDILIGENCE.AI</span><span>CLAUDE PROMPT BOOK</span></div>`,
  footerTemplate: `<div style="font-size:8px;font-family:monospace;color:#9a8f7a;width:100%;padding:0 0.7in;text-align:right;">p.<span class="pageNumber"></span></div>`,
});

await browser.close();

// merge cover + body
execSync(`gs -dNOPAUSE -dBATCH -dQUIET -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -sOutputFile="${finalPdf}" "${coverPdf}" "${bodyPdf}"`);
rmSync(coverPdf); rmSync(bodyPdf);

console.log('Built: ' + finalPdf);
