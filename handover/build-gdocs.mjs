/**
 * Generates one editable .docx per Claude prompt into handover/prompts-gdocs/.
 * A .docx is a ZIP of OOXML — built by hand (no deps) and zipped with the
 * system `zip`. Upload to Google Drive → "Open with Google Docs" to edit.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(readFileSync(join(__dirname, 'prompts.json'), 'utf8'));
const sp = P.systemPrompts;
const ex = P.extraction;

const outDir = join(__dirname, 'prompts-gdocs');
const tmpRoot = join(__dirname, '_gdocs_tmp');
rmSync(outDir, { recursive: true, force: true });
rmSync(tmpRoot, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- user-message templates (verbatim from the runner files) ----
const U = {
  classify: `Filename: <filename>\n\nClassify this document.`,
  extract: `Filename: <filename>\n\nExtract the document into the submit_extraction tool call.`,
  extractCorrection: `Filename: <filename>\n\nYou previously extracted this document. A verifier flagged the following issues:\n<verifier issues>\n\nRe-extract the document, correcting these issues. Use the same JSON tool call schema.`,
  verify: `Filename: <filename>\nDocument type (as classified): <type>\n\n# Fact sheet to verify\n\n<fact sheet markdown>\n\n# Extracted clauses (for page/quote verification)\n\n<numbered clause list: clauseType, page, risk, quote>\n\nVerify this fact sheet against the PDF above. Flag every hallucination or error you find.`,
  reconcile: `# Fact sheets for this deal\n\n<document blocks: <document documentId="..." name="..."> ... </document>>\n\nReconcile into the submit_reconciliation tool.`,
  anomaly: `Scope: <scope label>\nDocument count: <n>\n\n# Fact sheets to compare\n\n<document blocks>\n\nIdentify every outlier vs. peers.`,
  dealBrief: `Block 1:  Project: <project name> / Scope: <scope label> / Document count: <n>\nBlock 2 (cached):  # Master entities summary ...\nBlock 3 (cached):  <playbook> ... </playbook>\nBlock 4:  # In-scope document fact sheets  <document blocks>`,
  riskReport: `Block 1 (cached):  # Deal Brief  <brief markdown>\nBlock 2 (cached):  # Pinned document fact sheets  <document blocks>\nBlock 3:  # User prompt  <user's task prompt>   +   Model ID for the report header: <model>`,
  chat: `Block 1 (cached):  # Deal Brief  <brief markdown>\nBlock 2 (cached):  # Pinned document fact sheets  <document blocks>   (only if user pinned docs)\nHandshake:  assistant acknowledges "Ready." via submit_chat, then prior conversation history\nFinal turn:  <user's message>`,
};

// ---- block → WordprocessingML ----
const pStyled = (style, text) =>
  text === ''
    ? `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr></w:p>`
    : `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

const codeBlock = (text) =>
  String(text).replace(/\t/g, '    ').split(/\r?\n/).map((line) => pStyled('Code', line)).join('');

function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      if (b.title) return pStyled('Title', b.title);
      if (b.h1) return pStyled('Heading1', b.h1);
      if (b.h2) return pStyled('Heading2', b.h2);
      if (b.meta) return pStyled('Meta', b.meta);
      if (b.body) return pStyled('Normal', b.body);
      if (b.code !== undefined) return codeBlock(b.code);
      return '';
    })
    .join('');
}

// ---- static package parts ----
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="152238"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="1F3253"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="8F6A2C"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="E4DCCD"/></w:pBdr><w:spacing w:after="180"/></w:pPr><w:rPr><w:i/><w:color w:val="46556E"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F4F1E9"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
</w:styles>`;

const docXml = (blocks) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${renderBlocks(blocks)}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

// ---- assemble each document's content blocks ----
const TYPE_ORDER = ['SPA', 'APA', 'LOI', 'NDA', 'EMPLOYMENT', 'LEASE', 'FINANCIAL', 'CORPORATE', 'GENERIC'];
const editNote =
  'This is the exact prompt the platform sends to Claude. Edit the text in the shaded boxes freely. Keep the overall structure, and leave angle-bracket placeholders like <filename> — those are filled in automatically at runtime.';

function simpleDoc({ title, meta, sys, userLabel, userNote, user }) {
  return [
    { title },
    { meta },
    { body: editNote },
    { h2: 'System prompt' },
    { code: sys },
    { h2: userLabel || 'User message template' },
    ...(userNote ? [{ body: userNote }] : []),
    { code: user },
  ];
}

const docs = [
  {
    file: '01-Document-Classification.docx',
    blocks: simpleDoc({
      title: 'Document Classification — Prompt',
      meta: 'Model: Haiku   ·   Tool call: submit_classification   ·   Runs: every upload (first 2 pages)   ·   Source: prompts/classify.ts',
      sys: sp.classify,
      userNote: 'The first 2 pages of the PDF are attached as a document block alongside this text.',
      user: U.classify,
    }),
  },
  {
    file: '02-Document-Extraction.docx',
    blocks: [
      { title: 'Document Extraction — Prompt' },
      { meta: 'Model: Haiku / Sonnet / Opus (routed by size + type)   ·   Tool call: submit_extraction   ·   Runs: once per document   ·   Source: prompts/extraction/' },
      { body: editNote },
      { body: 'The system prompt is assembled from four parts: Shared preamble + Few-shot examples + one Type block (chosen by document type) + an optional Playbook block.' },
      { h2: 'Part A — Shared preamble (cached; same for every extraction)' },
      { code: ex.sharedPreamble },
      { h2: 'Part B — Few-shot examples (cached)' },
      { code: ex.fewShot },
      { h1: 'Part C — Type blocks' },
      { body: 'Exactly one of the following is appended, based on the classified document type.' },
      ...TYPE_ORDER.flatMap((t) => [{ h2: `Type block · ${t}` }, { code: ex.typeBlocks[t] }]),
      { h1: 'Part D — Playbook block' },
      { body: 'Appended only when the project has a playbook. Template shape:' },
      { code: `<playbook>\n# Playbook (customer's preferred positions for this deal)\n\n## Deal context\n<free text>\n\n## Red flags (force HIGH on any match)\n- <red flag>\n\n## Standard positions\n### <CLAUSE_TYPE>\n**Preferred:** <language>\n**Fallbacks:** "<a>" | "<b>"\n**Risk if deviates:** <LOW|MEDIUM|HIGH>\n_Notes:_ <notes>\n</playbook>` },
      { h1: 'User messages' },
      { h2: 'Normal pass' },
      { code: U.extract },
      { h2: 'Re-extraction after the verifier finds issues' },
      { code: U.extractCorrection },
    ],
  },
  {
    file: '03-Extraction-Verification.docx',
    blocks: simpleDoc({
      title: 'Extraction Verification — Prompt',
      meta: 'Model: Sonnet   ·   Tool call: submit_verification   ·   Runs: after every extraction   ·   Source: prompts/verify.ts',
      sys: sp.verify,
      userNote: 'The original PDF is attached (cached) so the verifier checks quotes and pages against the real source.',
      user: U.verify,
    }),
  },
  {
    file: '04-Entity-Reconciliation.docx',
    blocks: simpleDoc({
      title: 'Entity Reconciliation — Prompt',
      meta: 'Model: Sonnet   ·   Tool call: submit_reconciliation   ·   Runs: deal has 2+ docs, debounced 30s   ·   Source: prompts/reconciliation.ts',
      sys: sp.reconciliation,
      user: U.reconcile,
    }),
  },
  {
    file: '05-Anomaly-Detection.docx',
    blocks: simpleDoc({
      title: 'Anomaly Detection — Prompt',
      meta: 'Model: Sonnet   ·   Tool call: submit_anomalies   ·   Runs: deal has 3+ comparable docs   ·   Source: prompts/reconciliation.ts',
      sys: sp.anomaly,
      user: U.anomaly,
    }),
  },
  {
    file: '06-Deal-Brief.docx',
    blocks: simpleDoc({
      title: 'Deal Brief — Prompt',
      meta: 'Model: Sonnet   ·   Tool call: submit_brief   ·   Runs: once per access scope, during reconciliation   ·   Source: prompts/deal-brief.ts',
      sys: sp.dealBrief,
      userLabel: 'User message / assembled context',
      userNote: 'Sent as four content blocks; the master-entities summary and playbook are cached. Human-edited sections are spliced back in afterward, outside the model call.',
      user: U.dealBrief,
    }),
  },
  {
    file: '07-Risk-Report-Kanban.docx',
    blocks: simpleDoc({
      title: 'Risk Report (Kanban AI Task) — Prompt',
      meta: 'Model: Opus   ·   Tool call: submit_report   ·   Runs: task card dragged into progress   ·   Source: prompts/riskReport.ts',
      sys: sp.riskReport,
      userLabel: 'User message / assembled context',
      userNote: 'The deal brief and pinned fact sheets are cached so repeat runs within the cache window are cheap.',
      user: U.riskReport,
    }),
  },
  {
    file: '08-VDR-Chat.docx',
    blocks: simpleDoc({
      title: 'VDR Chat — Prompt',
      meta: 'Model: Haiku   ·   Tool call: submit_chat   ·   Runs: every chat message   ·   Source: prompts/chat.ts',
      sys: sp.chat,
      userLabel: 'User message / assembled context',
      userNote: 'A priming handshake loads the brief and pinned docs (cached); the model acknowledges, then the real conversation follows.',
      user: U.chat,
    }),
  },
];

// ---- write package + zip into .docx ----
for (const d of docs) {
  const root = join(tmpRoot, d.file.replace(/\.docx$/, ''));
  mkdirSync(join(root, '_rels'), { recursive: true });
  mkdirSync(join(root, 'word', '_rels'), { recursive: true });
  writeFileSync(join(root, '[Content_Types].xml'), CONTENT_TYPES);
  writeFileSync(join(root, '_rels', '.rels'), RELS);
  writeFileSync(join(root, 'word', 'document.xml'), docXml(d.blocks));
  writeFileSync(join(root, 'word', 'styles.xml'), STYLES);
  writeFileSync(join(root, 'word', '_rels', 'document.xml.rels'), DOC_RELS);

  const out = join(outDir, d.file);
  if (existsSync(out)) rmSync(out);
  // [Content_Types].xml must be the first entry in the archive.
  execSync(`zip -X -q "${out}" "[Content_Types].xml"`, { cwd: root });
  execSync(`zip -rX -q "${out}" _rels word`, { cwd: root });
}

rmSync(tmpRoot, { recursive: true, force: true });
console.log(`Built ${docs.length} .docx files in ${outDir}`);
