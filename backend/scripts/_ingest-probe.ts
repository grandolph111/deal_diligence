/**
 * Ad-hoc ingestion probe. Runs the REAL extractionService.runPipeline over a
 * handful of PDFs and reports per-doc timing + results. Persists NOTHING and
 * touches no deal — projectId is a throwaway so playbook lookups return null.
 */
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { extractionService } from '../src/services/extraction.service';
import { usageMeter } from '../src/integrations/claude';
import { loadCuadTruth, truthKey, matches } from './cuad-truth';

const THROWAWAY_PROJECT = '00000000-0000-0000-0000-000000000000';

const pageCount = async (b: Buffer): Promise<number | null> => {
  try { return (await PDFDocument.load(b, { updateMetadata: false })).getPageCount(); } catch { return null; }
};

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) { console.error('usage: _ingest-probe.ts <pdf> [pdf...]'); process.exit(1); }
  const truth = loadCuadTruth();

  console.log(`\nIngestion probe — ${files.length} doc(s), no persistence, provider=${process.env.CLAUDE_PROVIDER}, anchor=${process.env.CLAUDE_ANCHOR_QUOTING || 'off'}\n`);

  for (const f of files) {
    const name = path.basename(f);
    const bytes = fs.readFileSync(f);
    const pages = await pageCount(bytes);
    const t0 = Date.now();
    try {
      const r = await extractionService.runPipeline({
        filename: name, mimeType: 'application/pdf', bytes,
        projectId: THROWAWAY_PROJECT, priority: (process.env.PRIORITY as any) || 'P2',
      });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const ex = r.extraction;
      const highClauses = ex.clauses.filter(c => c.riskLevel === 'HIGH').length;
      const citIssues = r.citationIssues.length;
      const hall = r.citationIssues.filter(i => i.type === 'HALLUCINATED_QUOTE').length;
      const wrongPage = r.citationIssues.filter(i => i.type === 'WRONG_PAGE').length;

      // Ground-truth recall if this doc is in CUAD.
      const t = truth.get(truthKey(name));
      let recallStr = 'n/a (not in CUAD truth)';
      if (t) {
        const ourTypes = ex.clauses.map(c => c.clauseType);
        let hit = 0;
        for (const gc of t.clause) if (ourTypes.some(ot => matches(gc, ot))) hit++;
        recallStr = `${hit}/${t.clause.length} gold categories (${(hit / Math.max(t.clause.length,1) * 100).toFixed(0)}%)`;
      }

      console.log(`● ${name}`);
      console.log(`    ${pages}pp → ${secs}s | type=${r.classification.documentType} | clauses=${ex.clauses.length} (${highClauses} HIGH) | entities=${ex.entities.length} | rels=${ex.relationships.length}`);
      console.log(`    risk=${ex.riskScore}/10 ${ex.riskLevel ?? ''} | confidence=${ex.confidenceScore} | citation issues=${citIssues} (halluc=${hall}, wrongPage=${wrongPage}) | verifyQueued=${r.verifyQueued}`);
      console.log(`    recall=${recallStr}`);
      console.log('');
    } catch (err) {
      console.log(`● ${name}\n    ${pages}pp → FAILED after ${((Date.now()-t0)/1000).toFixed(1)}s: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  const u = usageMeter.snapshot();
  const inTok = Object.values(u.byModel).reduce((a, m: any) => a + m.inputTokens, 0);
  const outTok = Object.values(u.byModel).reduce((a, m: any) => a + m.outputTokens, 0);
  console.log(`Total spend: $${u.totalUsd.toFixed(4)} across ${u.totalCalls} calls (in=${inTok} out=${outTok})`);
  console.log(`By model: ${Object.entries(u.byModel).map(([m, t]: any) => `${m}=${t.calls}`).join(', ')}`);
  process.exit(0);
}
main();
