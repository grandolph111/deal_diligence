/**
 * CUAD gold-set accuracy harness.
 *
 * Measures the extraction pipeline against expert-annotated ground truth (CUAD:
 * 510 commercial contracts × 41 clause categories). For a sample of contracts it
 * runs classify + extract, then scores RECALL / PRECISION / GROUNDING (defined in
 * METRIC_GLOSSARY below), reports exact spend, and PERSISTS the run to
 * backend/scripts/eval-results/<timestamp>.{json,md} AFTER EVERY DOCUMENT — so a
 * time/budget stop or a hard kill always leaves the latest complete data on disk.
 *
 * Runs REAL Claude calls — costs money. Stops at whichever comes first: SAMPLE
 * contracts, BUDGET dollars, or MINUTES elapsed.
 *   SAMPLE=80 BUDGET=15 MINUTES=25 npx ts-node --transpile-only scripts/cuad-eval.ts
 *   env knobs: SAMPLE (max contracts), BUDGET ($ stop), MINUTES (time stop), OFFSET (skip first N), LABEL (filename tag)
 */

import fs from 'fs';
import path from 'path';
import {
  classifyDocument,
  extractDocument,
  pickExtractionModel,
  usageMeter,
} from '../src/integrations/claude';
import { extractPdfPages, validateCitations, type CitationIssue } from '../src/utils/citation-validator';
import { loadCuadTruth, truthKey, matches, spanOverlap } from './cuad-truth';

const CUAD = path.resolve(__dirname, '../../CUAD_v1');
const SAMPLE = parseInt(process.env.SAMPLE || '5', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10); // skip the first N eligible (avoid re-running docs)
const BUDGET = parseFloat(process.env.BUDGET || '6'); // hard $ stop — halt before exceeding
const MINUTES = parseFloat(process.env.MINUTES || '0'); // wall-clock stop (0 = no time limit)
const LABEL = (process.env.LABEL || '').replace(/[^a-z0-9_-]/gi, '');
const RESULTS_DIR = path.resolve(__dirname, 'eval-results');

/** Plain-English definition of each metric — printed at run start and written to the top of every report. */
const METRIC_GLOSSARY = `WHAT THE METRICS MEAN  (ground truth: authoritative CUAD_v1.json — 36 clause categories; 5 metadata excluded)
  RECALL    — Of the clause categories CUAD's lawyers marked present, what fraction did we find?
              Misses hurt this. Low recall = we are MISSING real clauses (the expensive failure in diligence).
  PRECISION — Of the CUAD-tracked clauses we reported, what fraction were actually present?
              False alarms hurt this. Low precision = we are OVER-REPORTING clauses that aren't there (review noise).
              Scored only on the 36 clause categories; our extra types (indemnification, reps & warranties,
              confidentiality, payment terms) and CUAD metadata (parties/dates) are excluded.
  GROUNDING — Of our attached quotes, what fraction are NOT fabricated (appear in the document at all)?
              The pure hallucination check — only quotes that match nothing (<50% sim) count against it.
  VERBATIM  — Stricter: what fraction match the source WORD-FOR-WORD? A present-but-paraphrased/OCR-drifted
              quote passes grounding (it's real) but fails verbatim. The gap = transcription fidelity.
  SPAN ACC  — When we correctly flag a category present, does our quote overlap the annotator's highlighted
              span? A pessimistic lower bound — CUAD marks ONE span/category, but a clause can appear in
              several valid places, so quoting a different-but-correct instance scores as a miss.`;

const buildPdfIndex = (): Map<string, string> => {
  const idx = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.pdf$/i.test(e.name)) idx.set(e.name.toLowerCase(), p);
    }
  };
  walk(path.join(CUAD, 'full_contract_pdf'));
  return idx;
};

interface DocResult {
  name: string;
  model: string;
  documentType: string;
  goldCount: number;
  oursCount: number;
  recall: number;
  precision: number;
  grounding: number;
  verbatim: number; // stricter than grounding: quote matches source word-for-word (loose matches excluded)
  spanAcc: number | null; // of correct-category clauses, fraction whose quote overlaps the annotator span
  missedCategories: string[]; // gold clauses we failed to find (recall failures)
  falsePositives: string[]; // CUAD categories we claimed that gold says aren't there (precision failures)
  hallucinatedQuotes: Array<{ clauseType: string; quote: string; similarity: number }>; // grounding failures
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Write JSON + Markdown from the current accumulators. Called after every doc and at the end. */
function persist(
  base: string,
  perDoc: DocResult[],
  catHits: Map<string, { hit: number; total: number }>,
  catFalsePos: Map<string, number>,
  hallucByType: Map<string, number>,
  status: { budgetStopped: boolean; timeStopped: boolean; done: boolean }
): { jsonPath: string; mdPath: string } {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const aggRecall = mean(perDoc.map((d) => d.recall));
  const aggPrecision = mean(perDoc.map((d) => d.precision));
  const aggGrounding = mean(perDoc.map((d) => d.grounding));
  const aggVerbatim = mean(perDoc.map((d) => d.verbatim));
  const spanVals = perDoc.map((d) => d.spanAcc).filter((x): x is number => x !== null);
  const aggSpan = spanVals.length ? mean(spanVals) : null;
  const worst = [...catHits.entries()]
    .map(([c, r]) => ({ c, rate: r.hit / r.total, ...r }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
    .slice(0, 12);
  const topFalsePos = [...catFalsePos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const spend = usageMeter.snapshot();

  const jsonPayload = {
    ranAt: new Date().toISOString(),
    status,
    config: { SAMPLE, OFFSET, BUDGET, MINUTES },
    aggregate: { contracts: perDoc.length, recall: aggRecall, precision: aggPrecision, grounding: aggGrounding, verbatim: aggVerbatim, spanAccuracy: aggSpan },
    categoryRecall: [...catHits.entries()]
      .map(([c, r]) => ({ category: c, hit: r.hit, total: r.total, rate: r.hit / r.total }))
      .sort((a, b) => a.rate - b.rate),
    falsePositives: topFalsePos.map(([category, count]) => ({ category, count })),
    hallucinationsByType: [...hallucByType.entries()].map(([clauseType, count]) => ({ clauseType, count })).sort((a, b) => b.count - a.count),
    spend,
    perDoc,
  };
  const jsonPath = path.join(RESULTS_DIR, `${base}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2));

  const md: string[] = [];
  md.push(`# CUAD eval — ${jsonPayload.ranAt}`);
  md.push('');
  const state = status.done ? 'complete' : status.budgetStopped ? 'budget-stopped' : status.timeStopped ? 'time-stopped' : 'in-progress';
  md.push(`_status: **${state}**_`);
  md.push('');
  md.push('```');
  md.push(METRIC_GLOSSARY);
  md.push('```');
  md.push('');
  md.push(`**Sample:** ${perDoc.length} contracts (SAMPLE=${SAMPLE}, OFFSET=${OFFSET}, budget $${BUDGET}${MINUTES ? `, ${MINUTES}min cap` : ''})`);
  md.push('');
  md.push('| Metric | Score |');
  md.push('|---|---|');
  md.push(`| Clause recall | ${(aggRecall * 100).toFixed(1)}% |`);
  md.push(`| Clause precision | ${(aggPrecision * 100).toFixed(1)}% |`);
  md.push(`| Grounding (fabrication-free) | ${(aggGrounding * 100).toFixed(1)}% |`);
  md.push(`| Verbatim rate (word-for-word) | ${(aggVerbatim * 100).toFixed(1)}% |`);
  md.push(`| Span accuracy | ${aggSpan === null ? 'n/a' : (aggSpan * 100).toFixed(1) + '%'} |`);
  md.push(`| Spend | $${spend.totalUsd.toFixed(2)} (~$${(spend.totalUsd / (perDoc.length || 1)).toFixed(3)}/contract) |`);
  md.push('');
  md.push('## Lowest-recall categories (we miss these)');
  md.push('');
  md.push('| Recall | Category | Found/Present |');
  md.push('|---|---|---|');
  for (const w of worst) md.push(`| ${(w.rate * 100).toFixed(0)}% | ${w.c} | ${w.hit}/${w.total} |`);
  md.push('');
  if (topFalsePos.length) {
    md.push('## Most-common false positives (we over-report these)');
    md.push('');
    md.push('| Count | Category |');
    md.push('|---|---|');
    for (const [c, n] of topFalsePos) md.push(`| ${n}× | ${c} |`);
    md.push('');
  }
  const allHalluc = perDoc.flatMap((d) => d.hallucinatedQuotes.map((h) => ({ doc: d.name, ...h })));
  if (allHalluc.length) {
    md.push(`## Hallucinated / mis-transcribed quotes (${allHalluc.length})`);
    md.push('');
    for (const h of allHalluc.slice(0, 40)) {
      md.push(`- **${h.clauseType}** (${h.doc}, sim ${(h.similarity * 100).toFixed(0)}%): "${h.quote.slice(0, 160).replace(/\n/g, ' ')}"`);
    }
    md.push('');
  }
  md.push('## Per-document detail');
  md.push('');
  md.push('| Doc | Type | Model | Recall | Prec | Ground | Missed |');
  md.push('|---|---|---|---|---|---|---|');
  for (const d of perDoc) {
    md.push(`| ${d.name} | ${d.documentType} | ${d.model.replace('claude-', '')} | ${(d.recall * 100).toFixed(0)}% | ${(d.precision * 100).toFixed(0)}% | ${(d.grounding * 100).toFixed(0)}% | ${d.missedCategories.join('; ') || '—'} |`);
  }
  md.push('');
  const mdPath = path.join(RESULTS_DIR, `${base}.md`);
  fs.writeFileSync(mdPath, md.join('\n'));
  return { jsonPath, mdPath };
}

async function main() {
  // Authoritative ground truth (CUAD_v1.json): clause categories per contract, keyed by
  // lowercased filename (matches pdfIndex). Metadata categories are excluded from clause scoring.
  const truth = loadCuadTruth();
  const pdfIndex = buildPdfIndex();
  const gold: Record<string, string[]> = {};
  for (const [fnameLower] of pdfIndex) {
    const t = truth.get(truthKey(fnameLower));
    if (t && t.clause.size) gold[fnameLower] = [...t.clause];
  }

  // FILES=<path to JSON array of filenames> targets an exact contract set (e.g. the
  // sample-deal 21) so prompt A/Bs run on the identical docs. Otherwise slice by OFFSET/SAMPLE.
  let chosen: Array<[string, string[]]>;
  if (process.env.FILES) {
    const wanted: string[] = JSON.parse(fs.readFileSync(process.env.FILES, 'utf8'));
    chosen = wanted
      .map((fn) => { const k = fn.toLowerCase(); return gold[k] ? [k, gold[k]] as [string, string[]] : null; })
      .filter((e): e is [string, string[]] => !!e && pdfIndex.has(e[0]));
    console.log(`FILES targeting: ${chosen.length}/${wanted.length} requested contracts resolved.`);
  } else {
    chosen = Object.entries(gold)
      .filter(([fn, cats]) => cats.length >= 5 && pdfIndex.has(fn))
      .slice(OFFSET, OFFSET + SAMPLE);
  }

  const cuadUniverse = [...new Set(Object.values(gold).flat())];

  console.log(METRIC_GLOSSARY + '\n');
  console.log(`CUAD accuracy harness — up to ${chosen.length} contracts (SAMPLE=${SAMPLE}, OFFSET=${OFFSET}, budget $${BUDGET}${MINUTES ? `, ${MINUTES}min cap` : ''})\n`);
  usageMeter.reset();

  const startMs = Date.now();
  const deadlineMs = MINUTES ? startMs + MINUTES * 60_000 : Infinity;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = `${stamp}${LABEL ? '-' + LABEL : ''}`;

  const perDoc: DocResult[] = [];
  const catHits = new Map<string, { hit: number; total: number }>();
  const catFalsePos = new Map<string, number>();
  const hallucByType = new Map<string, number>();
  let spanHitTotal = 0, spanDenTotal = 0;
  const status = { budgetStopped: false, timeStopped: false, done: false };

  for (const [filename, goldCats] of chosen) {
    if (Date.now() >= deadlineMs) {
      status.timeStopped = true;
      console.log(`\n  ⏱ time stop: ${MINUTES}min elapsed — halting after ${perDoc.length} contracts`);
      break;
    }
    const pdfPath = pdfIndex.get(filename.toLowerCase())!;
    const bytes = fs.readFileSync(pdfPath);
    const short = filename.slice(0, 46);
    try {
      const cls = await classifyDocument({ pdfBytes: bytes, filename });
      const { pages } = await extractPdfPages(bytes);
      const decision = pickExtractionModel({ pageCount: pages.length, documentType: cls.documentType, priority: 'P1' });
      // MODEL=<id> forces one model for all docs — isolates the prompt as the only
      // variable in an A/B (and keeps cost predictable). Otherwise use size-based routing.
      const model = process.env.MODEL || decision.model;
      const extraction = await extractDocument(
        { kind: 'pdf', bytes, filename },
        { documentType: cls.documentType, playbook: null, modelOverride: model }
      );
      const citationIssues = validateCitations(extraction, pages);
      const ourTypes = (extraction.clauses ?? []).map((c) => c.clauseType);

      let hit = 0;
      const missedCategories: string[] = [];
      for (const gc of goldCats) {
        const found = ourTypes.some((ot) => matches(gc, ot));
        const rec = catHits.get(gc) ?? { hit: 0, total: 0 };
        rec.total += 1;
        if (found) { rec.hit += 1; hit += 1; } else { missedCategories.push(gc); }
        catHits.set(gc, rec);
      }
      const recall = goldCats.length ? hit / goldCats.length : 0;

      const claimedCuad = new Set<string>();
      for (const ot of ourTypes) {
        const c = cuadUniverse.find((cc) => matches(cc, ot));
        if (c) claimedCuad.add(c);
      }
      const goldSet = new Set(goldCats);
      const falsePositives = [...claimedCuad].filter((c) => !goldSet.has(c));
      for (const fp of falsePositives) catFalsePos.set(fp, (catFalsePos.get(fp) ?? 0) + 1);
      const precision = claimedCuad.size ? (claimedCuad.size - falsePositives.length) / claimedCuad.size : 1;

      const total = (extraction.clauses ?? []).length;
      const hallucIssues = citationIssues.filter((i: CitationIssue) => i.type === 'HALLUCINATED_QUOTE');
      for (const h of hallucIssues) hallucByType.set(h.clauseType, (hallucByType.get(h.clauseType) ?? 0) + 1);
      // grounding = fabrication-free (HIGH severity = "does not appear anywhere"); verbatim
      // rate is the stricter measure that also counts MEDIUM loose/paraphrase matches.
      const fabricated = hallucIssues.filter((h) => h.severity === 'HIGH').length;
      const grounding = total ? (total - fabricated) / total : 1;
      const verbatim = total ? (total - hallucIssues.length) / total : 1;

      // span accuracy: of our clauses that hit a real gold category, does the quote overlap the annotator span?
      const tr = truth.get(truthKey(filename));
      let spanHit = 0, spanDen = 0;
      for (const c of (extraction.clauses ?? [])) {
        const g = goldCats.find((gc) => matches(gc, c.clauseType));
        const spans = g ? tr?.spans.get(g) : undefined;
        if (!spans || !spans.length) continue;
        spanDen += 1;
        if (spanOverlap(c.content ?? '', spans)) spanHit += 1;
      }
      spanHitTotal += spanHit; spanDenTotal += spanDen;
      const spanAcc = spanDen ? spanHit / spanDen : null;

      perDoc.push({
        name: short, model, documentType: cls.documentType,
        goldCount: goldCats.length, oursCount: total, recall, precision, grounding, verbatim, spanAcc,
        missedCategories, falsePositives,
        hallucinatedQuotes: hallucIssues.map((h) => ({ clauseType: h.clauseType, quote: h.quote, similarity: h.similarity })),
      });
      console.log(
        `  ${short.padEnd(48)} recall=${(recall * 100).toFixed(0)}% (${hit}/${goldCats.length})  prec=${(precision * 100).toFixed(0)}%  grounding=${(grounding * 100).toFixed(0)}%  span=${spanAcc === null ? 'n/a' : (spanAcc * 100).toFixed(0) + '%'}  [${model}]`
      );

      // persist after EVERY doc so any stop leaves complete data on disk
      persist(base, perDoc, catHits, catFalsePos, hallucByType, status);

      const spent = usageMeter.snapshot().totalUsd;
      if (spent >= BUDGET) {
        status.budgetStopped = true;
        console.log(`\n  ⚠ budget stop: $${spent.toFixed(2)} ≥ $${BUDGET} — halting after ${perDoc.length} contracts`);
        break;
      }
    } catch (e) {
      console.log(`  ${short.padEnd(48)} ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (!status.budgetStopped && !status.timeStopped) status.done = true;

  console.log(`\n=== aggregate over ${perDoc.length} contracts ===`);
  console.log(`  mean clause recall:    ${(mean(perDoc.map((d) => d.recall)) * 100).toFixed(1)}%`);
  console.log(`  mean clause precision: ${(mean(perDoc.map((d) => d.precision)) * 100).toFixed(1)}%`);
  console.log(`  mean grounding:        ${(mean(perDoc.map((d) => d.grounding)) * 100).toFixed(1)}%  (fabrication-free)`);
  console.log(`  mean verbatim rate:    ${(mean(perDoc.map((d) => d.verbatim)) * 100).toFixed(1)}%  (word-for-word)`);
  console.log(`  span accuracy:         ${spanDenTotal ? (spanHitTotal / spanDenTotal * 100).toFixed(1) + '%' : 'n/a'}  (of ${spanDenTotal} correct-category clauses, quote overlaps annotator span)`);

  const spend = usageMeter.snapshot();
  console.log(`\n=== spend (${spend.totalCalls} Claude calls) ===`);
  for (const [model, t] of Object.entries(spend.byModel)) {
    console.log(`  ${model.padEnd(22)} ${t.calls} calls  in=${t.inputTokens} out=${t.outputTokens}  $${t.costUsd.toFixed(4)}`);
  }
  console.log(`  TOTAL: $${spend.totalUsd.toFixed(4)}  (~$${(spend.totalUsd / (perDoc.length || 1)).toFixed(3)}/contract)`);

  const { jsonPath, mdPath } = persist(base, perDoc, catHits, catFalsePos, hallucByType, status);
  console.log(`\n📁 saved:\n  ${jsonPath}\n  ${mdPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
