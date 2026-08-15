/**
 * CUAD ingest + score — "do both at once".
 *
 * Ingests a diverse sample of CUAD contracts into a REAL deal (company → user →
 * project → documents) through the true persistence path
 * (extractionService.triggerExtraction: S3 fact sheet + DB clauses + knowledge
 * library filing), then scores the PERSISTED clauses against CUAD gold labels
 * (recall / precision / grounding) — so one extraction pass yields both a
 * browsable sample library/deal-map AND fresh accuracy numbers on the committed
 * prompt. Finally runs reconciliation to build the deal map + brief.
 *
 * Runs REAL Claude calls — costs money (~$0.26/contract).
 *   LIBRARY_ENABLED=true SAMPLE=25 BUDGET=8 npx ts-node --transpile-only scripts/cuad-ingest.ts
 */

import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../src/config/database';
import { extractionService } from '../src/services/extraction.service';
import { libraryWriterService } from '../src/services/library-writer.service';
import { reconciliationService } from '../src/services/reconciliation.service';
import { usageMeter } from '../src/integrations/claude';
import { extractPdfPages, validateCitations } from '../src/utils/citation-validator';
import { loadCuadTruth, truthKey, matches } from './cuad-truth';

const CUAD = path.resolve(__dirname, '../../CUAD_v1');
const SAMPLE = parseInt(process.env.SAMPLE || '25', 10);
const BUDGET = parseFloat(process.env.BUDGET || '8');
const RESULTS_DIR = path.resolve(__dirname, 'eval-results');

// dedicated, isolated tenancy for the sample deal (idempotent upserts)
const COMPANY_ID = 'cuad-sample-co';
const USER_AUTH0 = 'dev|cuad-sample';
const USER_EMAIL = 'cuad@dealdiligence.com';
const USER_PASSWORD = 'cuad-sample-2026';
const PROJECT_NAME = 'CUAD Sample Deal';

/** Walk full_contract_pdf, returning filename -> { path, type } (type = parent agreement-type folder). */
const buildPdfIndex = (): Map<string, { path: string; type: string }> => {
  const idx = new Map<string, { path: string; type: string }>();
  const walk = (dir: string, type: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, /^Part_/.test(e.name) || type === '' ? e.name.replace(/^Part_[I]+$/, '') : type || e.name);
      else if (/\.pdf$/i.test(e.name)) idx.set(e.name.toLowerCase(), { path: p, type });
    }
  };
  // type = the immediate parent folder under Part_x (Affiliate_Agreements, License_Agreements, …)
  const root = path.join(CUAD, 'full_contract_pdf');
  for (const part of fs.readdirSync(root)) {
    const partDir = path.join(root, part);
    if (!fs.statSync(partDir).isDirectory()) continue;
    for (const typeDir of fs.readdirSync(partDir)) {
      const td = path.join(partDir, typeDir);
      if (!fs.statSync(td).isDirectory()) continue;
      const stack = [td];
      while (stack.length) {
        const d = stack.pop()!;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) stack.push(p);
          else if (/\.pdf$/i.test(e.name)) idx.set(e.name.toLowerCase(), { path: p, type: typeDir });
        }
      }
    }
  }
  return idx;
};

/** Pick ~SAMPLE contracts spread across agreement types, each in gold with >=5 clauses. */
function pickDiverse(gold: Record<string, string[]>, pdfIndex: Map<string, { path: string; type: string }>, exclude: Set<string> = new Set()) {
  const byType = new Map<string, Array<{ filename: string; cats: string[]; path: string }>>();
  for (const [filename, cats] of Object.entries(gold)) {
    if (cats.length < 5) continue;
    if (exclude.has(filename.toLowerCase())) continue; // skip docs already in the deal — grab a NEW batch
    const hit = pdfIndex.get(filename.toLowerCase());
    if (!hit) continue;
    const arr = byType.get(hit.type) ?? [];
    arr.push({ filename, cats, path: hit.path });
    byType.set(hit.type, arr);
  }
  // round-robin across types for diversity
  const types = [...byType.keys()].sort();
  const picked: Array<{ filename: string; cats: string[]; path: string; type: string }> = [];
  let round = 0;
  while (picked.length < SAMPLE) {
    let added = 0;
    for (const t of types) {
      const arr = byType.get(t)!;
      if (arr[round]) { picked.push({ ...arr[round], type: t }); added++; }
      if (picked.length >= SAMPLE) break;
    }
    if (!added) break;
    round++;
  }
  return picked;
}

async function scaffold() {
  const company = await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: { id: COMPANY_ID, name: 'CUAD Sample Co', description: 'Isolated tenant for the CUAD sample deal.' },
  });
  const user = await prisma.user.upsert({
    where: { auth0Id: USER_AUTH0 },
    update: { companyId: company.id, devPassword: USER_PASSWORD },
    create: { auth0Id: USER_AUTH0, email: USER_EMAIL, name: 'CUAD Tester', devPassword: USER_PASSWORD, companyId: company.id },
  });
  let project = await prisma.project.findFirst({ where: { companyId: company.id, name: PROJECT_NAME } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: PROJECT_NAME,
        companyId: company.id,
        members: { create: { userId: user.id, role: 'OWNER', acceptedAt: new Date() } },
      },
    });
  }
  if (libraryWriterService.isEnabled()) await libraryWriterService.seedProjectLibrary(project.id, project.name);
  return { company, user, project };
}

async function main() {
  if (!libraryWriterService.isEnabled()) {
    console.log('⚠ LIBRARY_ENABLED is not true — deal map/library will not populate. Re-run with LIBRARY_ENABLED=true.');
  }
  // Authoritative ground truth (CUAD_v1.json) — clause categories only, keyed by filename.
  const truth = loadCuadTruth();
  const pdfIndex = buildPdfIndex();
  const gold: Record<string, string[]> = {};
  for (const [fnameLower] of pdfIndex) {
    const t = truth.get(truthKey(fnameLower));
    if (t && t.clause.size) gold[fnameLower] = [...t.clause];
  }
  const cuadUniverse = [...new Set(Object.values(gold).flat())];

  const { user, project } = await scaffold();
  console.log(`Deal ready: project "${project.name}" (${project.id})`);

  // skip contracts already ingested into this deal so we grab a genuinely NEW batch
  const existing = new Set(
    (await prisma.document.findMany({ where: { projectId: project.id }, select: { name: true } })).map((d) => d.name.toLowerCase())
  );
  const chosen = pickDiverse(gold, pdfIndex, existing);
  console.log(`${existing.size} docs already in deal; selected ${chosen.length} NEW contracts across ${new Set(chosen.map((c) => c.type)).size} agreement types.\n`);

  const s3 = new S3Client({ region: process.env.AWS_REGION });
  const bucket = process.env.S3_BUCKET!;
  usageMeter.reset();

  const perDoc: Array<{ name: string; type: string; recall: number; precision: number; grounding: number; gold: number; ours: number; risk: number | null }> = [];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  for (const doc of chosen) {
    const bytes = fs.readFileSync(doc.path);
    const short = doc.filename.slice(0, 44);
    try {
      // 1. Document row
      const s3Key = `projects/${project.id}/${doc.filename}`;
      const record = await prisma.document.upsert({
        where: { s3Key },
        update: { processingStatus: 'PENDING' },
        create: {
          projectId: project.id, uploadedById: user.id, name: doc.filename, s3Key,
          mimeType: 'application/pdf', sizeBytes: bytes.length,
          processingStatus: 'PENDING', priority: 'P1', extractionDepth: 'FULL',
        },
      });
      // 2. raw bytes to the SAME bucket extraction reads from
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: s3Key, Body: bytes, ContentType: 'application/pdf' }));
      // 3. real pipeline: classify + extract + verify + persist + file library
      await extractionService.triggerExtraction(record.id);

      // 4. score the PERSISTED output against gold
      const persisted = await prisma.document.findUnique({
        where: { id: record.id },
        include: { annotations: { where: { annotationType: 'CLAUSE', source: 'claude' } } },
      });
      const ourClauses = persisted?.annotations ?? [];
      const ourTypes = ourClauses.map((c) => c.clauseType || '');

      let hit = 0;
      for (const gc of doc.cats) if (ourTypes.some((ot) => matches(gc, ot))) hit++;
      const recall = doc.cats.length ? hit / doc.cats.length : 0;

      const claimedCuad = new Set<string>();
      for (const ot of ourTypes) { const c = cuadUniverse.find((cc) => matches(cc, ot)); if (c) claimedCuad.add(c); }
      const goldSet = new Set(doc.cats);
      const correct = [...claimedCuad].filter((c) => goldSet.has(c)).length;
      const precision = claimedCuad.size ? correct / claimedCuad.size : 1;

      // grounding: re-validate persisted quotes against the PDF pages
      const { pages } = await extractPdfPages(bytes);
      const pseudo = { clauses: ourClauses.map((c) => ({ clauseType: c.clauseType || '', content: c.content, pageNumber: c.pageNumber ?? null, title: '', riskLevel: 'LOW' })) } as never;
      const issues = validateCitations(pseudo, pages);
      const halluc = issues.filter((i) => i.type === 'HALLUCINATED_QUOTE').length;
      const grounding = ourClauses.length ? (ourClauses.length - halluc) / ourClauses.length : 1;

      perDoc.push({ name: short, type: doc.type, recall, precision, grounding, gold: doc.cats.length, ours: ourClauses.length, risk: persisted?.riskScore ?? null });
      console.log(`  ${short.padEnd(46)} [${doc.type.slice(0, 16).padEnd(16)}] recall=${(recall * 100).toFixed(0)}% prec=${(precision * 100).toFixed(0)}% ground=${(grounding * 100).toFixed(0)}% risk=${persisted?.riskScore ?? '?'}/10`);

      const spent = usageMeter.snapshot().totalUsd;
      if (spent >= BUDGET) { console.log(`\n  ⚠ budget stop: $${spent.toFixed(2)} ≥ $${BUDGET}`); break; }
    } catch (e) {
      console.log(`  ${short.padEnd(46)} ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 5. build the deal map + brief now (skip the 30s debounce)
  console.log('\nRunning reconciliation (deal map + brief)…');
  try { await reconciliationService.rebuildProjectGraph(project.id); console.log('  ✓ reconciliation complete'); }
  catch (e) { console.log('  reconciliation error:', e instanceof Error ? e.message : e); }

  const spend = usageMeter.snapshot();
  console.log(`\n=== ingested ${perDoc.length} contracts into "${PROJECT_NAME}" ===`);
  console.log(`  mean recall:    ${(mean(perDoc.map((d) => d.recall)) * 100).toFixed(1)}%`);
  console.log(`  mean precision: ${(mean(perDoc.map((d) => d.precision)) * 100).toFixed(1)}%`);
  console.log(`  mean grounding: ${(mean(perDoc.map((d) => d.grounding)) * 100).toFixed(1)}%`);
  console.log(`  spend: $${spend.totalUsd.toFixed(2)} (~$${(spend.totalUsd / (perDoc.length || 1)).toFixed(3)}/contract)`);
  console.log(`\n  LOGIN to view:  ${USER_EMAIL}  /  ${USER_PASSWORD}`);
  console.log(`  Project id: ${project.id}`);

  // persist a report
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(RESULTS_DIR, `${stamp}-ingest-n${perDoc.length}.json`);
  fs.writeFileSync(out, JSON.stringify({
    ranAt: new Date().toISOString(), projectId: project.id, projectName: PROJECT_NAME,
    login: { email: USER_EMAIL, password: USER_PASSWORD },
    aggregate: { contracts: perDoc.length, recall: mean(perDoc.map((d) => d.recall)), precision: mean(perDoc.map((d) => d.precision)), grounding: mean(perDoc.map((d) => d.grounding)) },
    spend, perDoc,
  }, null, 2));
  console.log(`\n📁 saved: ${out}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
