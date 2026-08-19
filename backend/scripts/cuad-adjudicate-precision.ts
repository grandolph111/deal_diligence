/**
 * Sparsity-adjusted precision.
 *
 * CUAD's gold is NOT exhaustive — annotators miss real clauses — so the raw
 * precision metric counts real-but-unannotated clauses as false positives. This
 * pass reads each false positive (a clause type we reported that CUAD's gold for
 * that doc lacks) and has a STRICT judge (Haiku — a different, cheaper tier than
 * the Sonnet/Opus that extracted, to limit circularity) rule whether the quoted
 * text genuinely establishes that clause type:
 *   - PRESENT  -> a real clause CUAD failed to annotate (sparsity, NOT our error)
 *   - ABSENT   -> a genuine mis-tag (our error)
 * Reports raw precision vs. sparsity-adjusted precision. Costs a little (Haiku).
 *
 *   PROJECT_ID=<id> npx ts-node --transpile-only scripts/cuad-adjudicate-precision.ts
 */

import { prisma } from '../src/config/database';
import { z } from 'zod';
import { loadCuadTruth, truthKey, matches } from './cuad-truth';
import { getClaudeClient, getModelId, usageMeter } from '../src/integrations/claude';
import { runToolUse } from '../src/integrations/claude/tool-use';

const PID = process.env.PROJECT_ID || 'a2442cc0-994d-4798-ba55-9f2502c42d69';
const BATCH = 12;

interface FP { doc: string; category: string; quote: string; }

const verdictSchema = z.object({
  verdicts: z.array(z.object({ index: z.number(), present: z.boolean(), reason: z.string() })),
});

const SYSTEM = `You are a STRICT senior M&A contract reviewer auditing an AI's clause tagging against a known-incomplete answer key. For each quoted passage from a real contract, decide whether the quote GENUINELY establishes the stated clause type.
- present=true ONLY if the quoted operative language unambiguously CREATES that exact provision.
- present=false otherwise. In particular, present=false when the quote:
  * states the OPPOSITE / a disclaimer — e.g. "there are NO third-party beneficiaries" is NOT a third-party-beneficiary clause; "binding upon successors and assigns" PERMITS assignment and is NOT anti-assignment; a clause LIMITING liability is NOT uncapped liability.
  * merely DEFINES a term (e.g. '"Change of Control" means…') with no operative trigger in the quote.
  * ACKNOWLEDGES existing ownership/rights rather than transferring them (not an IP assignment).
  * is a DIFFERENT but adjacent provision — indemnification tagged as uncapped liability, no-solicit of EMPLOYEES tagged as customers, event-triggered termination tagged as termination-for-convenience, a party setting ITS OWN price tagged as a price restriction.
Be strict and skeptical — when in doubt, present=false. Return a verdict for every item.`;

// Clause-judgment is nuanced reasoning, NOT the bottom (chat/Haiku) tier — a spot-check
// vs a careful human read showed Haiku over-credits badly (calls a clause's own inverse
// "present"). Default the judge to the reconciliation tier (Sonnet).
type Tier = 'chat' | 'reconciliation' | 'report' | 'extraction';
const JUDGE_TIER = (process.env.JUDGE_TIER as Tier) || 'reconciliation';
const ESCALATE_TIER = process.env.ESCALATE_TIER as Tier | undefined; // e.g. 'report' (Opus) to confirm "present" credits

async function adjudicate(client: ReturnType<typeof getClaudeClient>, batch: FP[], tier: Tier): Promise<Array<{ index: number; present: boolean }>> {
  const body = batch.map((f, i) => `#${i} — Clause type claimed: "${f.category}"\nQuoted text: "${f.quote.slice(0, 400).replace(/\s+/g, ' ')}"`).join('\n\n');
  const { input } = await runToolUse<z.infer<typeof verdictSchema>>({
    client,
    model: getModelId(tier),
    maxTokens: 2048,
    systemPrompt: SYSTEM,
    messages: [{ type: 'text', text: `Judge each item:\n\n${body}` }],
    toolName: 'submit_verdicts',
    toolDescription: 'Return a present/absent verdict for each numbered item.',
    toolSchema: verdictSchema,
  });
  return input.verdicts;
}

async function main() {
  const truth = loadCuadTruth();
  const clauseUniverse = [...new Set([...truth.values()].flatMap((v) => [...v.clause]))];
  const docs = await prisma.document.findMany({ where: { projectId: PID, processingStatus: 'COMPLETE' }, include: { annotations: { where: { annotationType: 'CLAUSE', source: 'claude' } } } });

  // Collect FPs (one per doc×claimed-category-not-in-gold) + per-doc claimed/correct counts.
  const fps: FP[] = [];
  let claimedTotal = 0, correctTotal = 0;
  for (const d of docs) {
    const t = truth.get(truthKey(d.name)); if (!t) continue;
    const goldSet = new Set([...t.clause]);
    const claimed = new Map<string, string>();
    for (const a of d.annotations) { const c = clauseUniverse.find((cc) => matches(cc, a.clauseType || '')); if (c && !claimed.has(c)) claimed.set(c, a.content || ''); }
    claimedTotal += claimed.size;
    for (const [cat, content] of claimed) {
      if (goldSet.has(cat)) { correctTotal++; continue; }
      fps.push({ doc: d.name, category: cat, quote: content });
    }
  }
  console.log(`FPs to adjudicate: ${fps.length} | raw precision: ${(correctTotal / claimedTotal * 100).toFixed(1)}% (${correctTotal}/${claimedTotal})\n`);

  usageMeter.reset();
  const client = getClaudeClient();
  console.log(`Judge tier: ${JUDGE_TIER}${ESCALATE_TIER ? ` (escalate "present" credits -> ${ESCALATE_TIER})` : ''}\n`);
  const verdicts: boolean[] = new Array(fps.length).fill(false);
  const reasons: string[] = new Array(fps.length).fill('');
  for (let i = 0; i < fps.length; i += BATCH) {
    const batch = fps.slice(i, i + BATCH);
    try {
      const vs = await adjudicate(client, batch, JUDGE_TIER);
      for (const v of vs) if (v.index >= 0 && v.index < batch.length) { verdicts[i + v.index] = v.present; reasons[i + v.index] = v.reason; }
      process.stdout.write(`  adjudicated ${Math.min(i + BATCH, fps.length)}/${fps.length}\r`);
    } catch (e) { console.log(`\n  batch ${i} error:`, e instanceof Error ? e.message : e); }
  }

  // Escalation: only the "present" credits can inflate precision, so re-confirm just those
  // with a stronger tier. A verdict survives as a real credit only if BOTH tiers agree.
  let overturned = 0;
  if (ESCALATE_TIER) {
    const presentIdx = fps.map((_, i) => i).filter((i) => verdicts[i]);
    console.log(`\n  escalating ${presentIdx.length} "present" credits to ${ESCALATE_TIER}…`);
    for (let j = 0; j < presentIdx.length; j += BATCH) {
      const idxs = presentIdx.slice(j, j + BATCH);
      const batch = idxs.map((i) => fps[i]);
      try {
        const vs = await adjudicate(client, batch, ESCALATE_TIER);
        for (const v of vs) if (v.index >= 0 && v.index < idxs.length && !v.present) { verdicts[idxs[v.index]] = false; overturned++; }
      } catch (e) { console.log(`\n  escalation batch ${j} error:`, e instanceof Error ? e.message : e); }
    }
    console.log(`  ${ESCALATE_TIER} overturned ${overturned} of ${presentIdx.length} credits back to mis-tags.`);
  }

  const realErrors = verdicts.filter((v) => !v).length;    // mis-tags (our error)
  const sparsity = verdicts.filter((v) => v).length;        // real clauses CUAD missed
  const adjPrecision = (correctTotal + sparsity) / claimedTotal;

  // Genuine mis-tags (our real precision errors): breakdown by category + save detail.
  const misTags = fps.map((f, i) => ({ ...f, reason: reasons[i] })).filter((_, i) => !verdicts[i]);
  const byCat = new Map<string, number>();
  for (const m of misTags) byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1);
  console.log(`\n\n=== GENUINE MIS-TAGS by category (our real precision errors) ===`);
  for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}x  ${c}`);
  const RESULTS = require('path').resolve(__dirname, 'eval-results');
  require('fs').mkdirSync(RESULTS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  require('fs').writeFileSync(require('path').join(RESULTS, `${stamp}-mistags.json`), JSON.stringify({ misTags, byCategory: [...byCat.entries()].map(([category, count]) => ({ category, count })) }, null, 2));
  console.log(`  saved mis-tag detail to eval-results/${stamp}-mistags.json`);
  const spend = usageMeter.snapshot();
  console.log(`\n\n=== SPARSITY-ADJUSTED PRECISION (${docs.length} docs) ===`);
  console.log(`  raw precision:        ${(correctTotal / claimedTotal * 100).toFixed(1)}%  (CUAD gold treated as exhaustive)`);
  console.log(`  false positives:      ${fps.length}`);
  console.log(`    -> real clauses CUAD missed (sparsity): ${sparsity} (${(sparsity / fps.length * 100).toFixed(0)}%)`);
  console.log(`    -> genuine mis-tags (our error):        ${realErrors} (${(realErrors / fps.length * 100).toFixed(0)}%)`);
  console.log(`  ADJUSTED precision:   ${(adjPrecision * 100).toFixed(1)}%  (crediting real-clause sparsity)`);
  console.log(`\n  spend: $${spend.totalUsd.toFixed(3)} (judge: ${JUDGE_TIER})`);
  console.log(`  caveat: judge is an LLM (Haiku), not human — a strict estimate, not ground truth.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
