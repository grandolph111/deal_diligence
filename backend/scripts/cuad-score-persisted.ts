/**
 * Score ALREADY-PERSISTED extractions against the AUTHORITATIVE CUAD ground truth
 * (CUAD_v1.json via cuad-truth.ts) — no Claude calls, $0.
 *
 * Reports, per project (default: the CUAD Sample Deal):
 *   - RECALL / PRECISION  — clause categories (36), our clauses[] vs annotator presence
 *   - GROUNDING           — our quotes vs the PDF text (hallucination check)
 *   - SPAN ACCURACY (new) — when we correctly flag a category present, does our quote
 *                           overlap the annotator's highlighted span? (pinpoint accuracy)
 *   - METADATA coverage   — informational: metadata categories (parties/dates) our
 *                           pipeline emits as structured fields, not clauses
 *
 *   PROJECT_ID=<id> npx ts-node --transpile-only scripts/cuad-score-persisted.ts
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { extractPdfPages, validateCitations } from '../src/utils/citation-validator';
import { loadCuadTruth, truthKey, matches, spanOverlap, METADATA_CATEGORIES } from './cuad-truth';

const CUAD = path.resolve(__dirname, '../../CUAD_v1');
const RESULTS_DIR = path.resolve(__dirname, 'eval-results');
const PROJECT_ID = process.env.PROJECT_ID || 'a2442cc0-994d-4798-ba55-9f2502c42d69';
const LABEL = (process.env.LABEL || 'persisted-v2').replace(/[^a-z0-9_-]/gi, '');

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

async function main() {
  const truth = loadCuadTruth();
  const pdfIndex = buildPdfIndex();

  let docs = await prisma.document.findMany({
    where: { projectId: PROJECT_ID, processingStatus: 'COMPLETE' },
    include: { annotations: { where: { annotationType: 'CLAUSE', source: 'claude' } } },
  });
  // FILES=<json array of filenames> restricts scoring to a fixed set (e.g. the original 21)
  if (process.env.FILES) {
    const want = new Set((JSON.parse(fs.readFileSync(process.env.FILES, 'utf8')) as string[]).map((f) => f.toLowerCase()));
    docs = docs.filter((d) => want.has(d.name.toLowerCase()));
  }
  console.log(`Scoring ${docs.length} persisted docs vs AUTHORITATIVE CUAD_v1.json (no Claude calls)\n`);

  interface Row { name: string; recall: number; precision: number; grounding: number; spanAcc: number | null; gold: number; ours: number; missed: string[]; metaGold: number }
  const perDoc: Row[] = [];
  const catHits = new Map<string, { hit: number; total: number }>();
  const catFalsePos = new Map<string, number>();
  let spanHitTotal = 0, spanDenTotal = 0;

  for (const d of docs) {
    const t = truth.get(truthKey(d.name));
    if (!t) { console.log(`  ${d.name.slice(0, 44)} — no CUAD entry, skipped`); continue; }
    const goldClause = [...t.clause];
    const ourTypes = d.annotations.map((a) => a.clauseType || '');

    // recall
    let hit = 0; const missed: string[] = [];
    for (const gc of goldClause) {
      const found = ourTypes.some((ot) => matches(gc, ot));
      const rec = catHits.get(gc) ?? { hit: 0, total: 0 };
      rec.total += 1;
      if (found) { rec.hit += 1; hit += 1; } else missed.push(gc);
      catHits.set(gc, rec);
    }
    const recall = goldClause.length ? hit / goldClause.length : 0;

    // precision (only over the 36 clause categories; metadata categories are excluded)
    const clauseUniverse = [...new Set([...truth.values()].flatMap((v) => [...v.clause]))];
    const claimed = new Set<string>();
    for (const ot of ourTypes) { const c = clauseUniverse.find((cc) => matches(cc, ot)); if (c) claimed.add(c); }
    const goldSet = new Set(goldClause);
    const fps = [...claimed].filter((c) => !goldSet.has(c));
    for (const fp of fps) catFalsePos.set(fp, (catFalsePos.get(fp) ?? 0) + 1);
    const precision = claimed.size ? (claimed.size - fps.length) / claimed.size : 1;

    // grounding (vs PDF text)
    let grounding = 1;
    const pdfPath = pdfIndex.get(d.name.toLowerCase());
    let pages: string[] | null = null;
    if (pdfPath) pages = (await extractPdfPages(fs.readFileSync(pdfPath))).pages;
    if (pages && d.annotations.length) {
      const pseudo = { clauses: d.annotations.map((a) => ({ clauseType: a.clauseType || '', content: a.content, pageNumber: a.pageNumber ?? null, title: '', riskLevel: 'LOW' })) } as never;
      const halluc = validateCitations(pseudo, pages).filter((i) => i.type === 'HALLUCINATED_QUOTE').length;
      grounding = (d.annotations.length - halluc) / d.annotations.length;
    }

    // span accuracy (NEW): of our clauses that hit a real gold category, does the quote
    // overlap the annotator's span for that category?
    let spanHit = 0, spanDen = 0;
    for (const a of d.annotations) {
      const ot = a.clauseType || '';
      const g = goldClause.find((gc) => matches(gc, ot));
      if (!g) continue; // false positive or no gold span — not a span-accuracy candidate
      const spans = t.spans.get(g);
      if (!spans || !spans.length) continue;
      spanDen += 1;
      if (spanOverlap(a.content, spans)) spanHit += 1;
    }
    spanHitTotal += spanHit; spanDenTotal += spanDen;
    const spanAcc = spanDen ? spanHit / spanDen : null;

    perDoc.push({ name: d.name.slice(0, 44), recall, precision, grounding, spanAcc, gold: goldClause.length, ours: d.annotations.length, missed, metaGold: t.metadata.size });
    console.log(`  ${d.name.slice(0, 44).padEnd(46)} recall=${(recall * 100).toFixed(0)}% (${hit}/${goldClause.length}) prec=${(precision * 100).toFixed(0)}% ground=${(grounding * 100).toFixed(0)}% span=${spanAcc === null ? 'n/a' : (spanAcc * 100).toFixed(0) + '%'}`);
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const agg = {
    recall: mean(perDoc.map((d) => d.recall)),
    precision: mean(perDoc.map((d) => d.precision)),
    grounding: mean(perDoc.map((d) => d.grounding)),
    spanAccuracy: spanDenTotal ? spanHitTotal / spanDenTotal : 0,
  };
  console.log(`\n=== ${perDoc.length} contracts vs authoritative CUAD_v1.json ===`);
  console.log(`  clause recall:    ${(agg.recall * 100).toFixed(1)}%`);
  console.log(`  clause precision: ${(agg.precision * 100).toFixed(1)}%`);
  console.log(`  quote grounding:  ${(agg.grounding * 100).toFixed(1)}%`);
  console.log(`  span accuracy:    ${(agg.spanAccuracy * 100).toFixed(1)}%  (of ${spanDenTotal} correct-category clauses, quote overlaps annotator span)`);

  const worst = [...catHits.entries()].map(([c, r]) => ({ c, rate: r.hit / r.total, ...r })).sort((a, b) => a.rate - b.rate || b.total - a.total).slice(0, 12);
  console.log(`\n  lowest-recall clause categories:`);
  for (const w of worst) console.log(`    ${(w.rate * 100).toFixed(0).padStart(3)}%  ${w.c} (${w.hit}/${w.total})`);
  const topFP = [...catFalsePos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`\n  top false positives:`);
  for (const [c, n] of topFP) console.log(`    ${String(n).padStart(2)}×  ${c}`);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(RESULTS_DIR, `${stamp}-${LABEL}-n${perDoc.length}.json`);
  fs.writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), source: 'CUAD_v1.json', projectId: PROJECT_ID, metadataCategories: [...METADATA_CATEGORIES], aggregate: { contracts: perDoc.length, ...agg }, categoryRecall: [...catHits.entries()].map(([c, r]) => ({ category: c, hit: r.hit, total: r.total, rate: r.hit / r.total })).sort((a, b) => a.rate - b.rate), falsePositives: topFP.map(([category, count]) => ({ category, count })), perDoc }, null, 2));
  console.log(`\n📁 saved: ${out}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
