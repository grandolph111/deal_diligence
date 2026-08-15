/**
 * Deterministic deal-brief rendering.
 *
 * Every enumerable brief section (Parties, Key Clauses, Key Dates, Cross-document
 * Anomalies, Document Registry, Inter-document Relationships) is rendered directly
 * from Postgres — no LLM tokens, and constant work regardless of deal size. Claude
 * only supplies the synthesis (snapshot, top risks, clause notes). `assembleBrief`
 * stitches the two together in the canonical section order, preserving the exact H1
 * headings and marker ids the frontend + human-edit round-trip depend on.
 */

import { prisma } from '../config/database';
import type { BriefSynthesis } from '../integrations/claude';

const RISK_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const CAP_PARTIES = 40;
const CAP_CLAUSE_INSTANCES = 8;
const CAP_DATES = 40;
const CAP_RELATIONSHIPS = 50;

/** Escape a value for a single markdown table cell (no pipes / newlines). */
const cell = (s: unknown): string => String(s ?? '—').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() || '—';
const inScope = (docIds: Set<string> | null) => (id: string | null | undefined): boolean =>
  docIds === null || (id != null && docIds.has(id));

interface DeterministicSections {
  parties: string;
  clauses: string;
  dates: string;
  anomalies: string;
  registry: string;
  relationships: string;
  docCount: number;
  portfolioRisk: number | null;
}

export async function renderDeterministicSections(
  projectId: string,
  docIds: Set<string> | null,
  clauseNotes: Array<{ clauseType: string; note: string }> = []
): Promise<DeterministicSections> {
  const keep = inScope(docIds);

  // One documents query backs the registry, doc-name map, dates, anomalies, portfolio risk.
  const docs = await prisma.document.findMany({
    where: { projectId, processingStatus: 'COMPLETE', ...(docIds ? { id: { in: [...docIds] } } : {}) },
    select: { id: true, name: true, documentType: true, pageCount: true, riskScore: true, riskLevel: true, effectiveDate: true, anomalyFlags: true },
    orderBy: [{ riskScore: 'desc' }, { name: 'asc' }],
  });
  const nameOf = new Map(docs.map((d) => [d.id, d.name]));
  const docCount = docs.length;
  const scored = docs.map((d) => d.riskScore).filter((r): r is number => r != null);
  const portfolioRisk = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;

  // ---- Document Registry ----
  const registry = [
    '| Doc | Type | Pages | Risk |',
    '|---|---|---:|---:|',
    ...docs.map((d) => `| ${cell(d.name)} | ${cell(d.documentType)} | ${cell(d.pageCount)} | ${cell(d.riskScore)} |`),
  ].join('\n');

  // ---- Cross-document Anomalies (already computed deterministically by reconciliation) ----
  const anomalyLines: string[] = [];
  for (const d of docs) {
    const flags = Array.isArray(d.anomalyFlags) ? (d.anomalyFlags as Array<{ reason?: string }>) : [];
    for (const f of flags) if (f?.reason) anomalyLines.push(`- **[${d.name}]** ${f.reason}`);
  }
  const anomalies = anomalyLines.length
    ? anomalyLines.join('\n')
    : 'No anomalies to report yet; need at least 3 peer documents per clause type.';

  // ---- Parties (master entities + which docs they appear in + related) ----
  const entities = await prisma.masterEntity.findMany({
    where: { projectId, entityType: { in: ['COMPANY', 'PERSON'] } },
    select: {
      canonicalName: true, entityType: true, aliases: true,
      documentEntities: { select: { documentId: true } },
      relatedEntities: { select: { relationshipType: true, targetEntity: { select: { canonicalName: true } } } },
    },
  });
  const partyRows = entities
    .map((e) => {
      const docIdsForEnt = [...new Set(e.documentEntities.map((de) => de.documentId).filter(keep))];
      return { e, docNames: docIdsForEnt.map((id) => nameOf.get(id)).filter(Boolean) as string[] };
    })
    .filter((r) => r.docNames.length > 0)
    .sort((a, b) => b.docNames.length - a.docNames.length);
  const partiesShown = partyRows.slice(0, CAP_PARTIES);
  const parties = partiesShown.length
    ? partiesShown
        .map(({ e, docNames }) => {
          const aliases = Array.isArray(e.aliases) ? (e.aliases as string[]).filter(Boolean) : [];
          const related = [...new Set(e.relatedEntities.map((r) => r.targetEntity?.canonicalName).filter(Boolean))] as string[];
          const lines = [`## ${e.canonicalName} (${e.entityType})`, `- Appears in: ${docNames.slice(0, 8).join(', ')}${docNames.length > 8 ? ` +${docNames.length - 8} more` : ''}`];
          if (related.length) lines.push(`- Related: ${related.slice(0, 6).join(', ')}`);
          if (aliases.length) lines.push(`- Aliases: ${aliases.slice(0, 6).join(', ')}`);
          return lines.join('\n');
        })
        .join('\n\n') + (partyRows.length > CAP_PARTIES ? `\n\n_+${partyRows.length - CAP_PARTIES} more parties_` : '')
    : '_No parties reconciled yet._';

  // ---- Key Clauses (PROVISION nodes grouped by clauseType) + optional Claude notes ----
  const provisions = await prisma.libraryNode.findMany({
    where: { projectId, type: 'PROVISION', ...(docIds ? { sourceDocumentId: { in: [...docIds] } } : {}) },
    select: { clauseType: true, riskLevel: true, pageNumber: true, sourceDocumentId: true, title: true },
  });
  const byType = new Map<string, typeof provisions>();
  for (const p of provisions) {
    if (!p.clauseType) continue;
    const arr = byType.get(p.clauseType) ?? [];
    arr.push(p);
    byType.set(p.clauseType, arr);
  }
  const noteFor = new Map(clauseNotes.map((n) => [n.clauseType.toUpperCase().replace(/[^A-Z]/g, ''), n.note]));
  const clauseGroups = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
  const clauses = clauseGroups.length
    ? clauseGroups
        .map(([type, items]) => {
          const pretty = type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
          const sorted = [...items].sort((a, b) => (RISK_RANK[a.riskLevel ?? 'LOW'] ?? 3) - (RISK_RANK[b.riskLevel ?? 'LOW'] ?? 3));
          const lines = [`## ${pretty}`];
          const note = noteFor.get(type.toUpperCase().replace(/[^A-Z]/g, ''));
          if (note) lines.push(`_${note}_`);
          for (const p of sorted.slice(0, CAP_CLAUSE_INSTANCES)) {
            const doc = p.sourceDocumentId ? nameOf.get(p.sourceDocumentId) ?? 'unknown' : 'unknown';
            lines.push(`- **[${doc}${p.pageNumber ? ` p.${p.pageNumber}` : ''}]** (${p.riskLevel ?? 'LOW'}): ${p.title || pretty}`);
          }
          if (sorted.length > CAP_CLAUSE_INSTANCES) lines.push(`- _+${sorted.length - CAP_CLAUSE_INSTANCES} more_`);
          return lines.join('\n');
        })
        .join('\n\n')
    : '_No clauses extracted yet._';

  // ---- Key Dates ----
  const dateEntities = await prisma.documentEntity.findMany({
    where: { entityType: 'DATE', document: { projectId }, ...(docIds ? { documentId: { in: [...docIds] } } : {}) },
    select: { text: true, pageNumber: true, documentId: true },
    take: 200,
  });
  const dateLines = [
    ...docs.filter((d) => d.effectiveDate).map((d) => `- ${d.effectiveDate!.toISOString().slice(0, 10)}: Effective date — ${d.name}`),
    ...dateEntities.map((e) => `- ${cell(e.text)}${e.pageNumber ? ` (p.${e.pageNumber})` : ''} — ${nameOf.get(e.documentId) ?? ''}`),
  ];
  const dates = dateLines.length ? dateLines.slice(0, CAP_DATES).join('\n') + (dateLines.length > CAP_DATES ? `\n- _+${dateLines.length - CAP_DATES} more_` : '') : '_No key dates extracted yet._';

  // ---- Inter-document Relationships ----
  const rels = await prisma.entityRelationship.findMany({
    where: { sourceEntity: { projectId } },
    select: { relationshipType: true, documentId: true, sourceEntity: { select: { canonicalName: true } }, targetEntity: { select: { canonicalName: true } } },
    take: 500,
  });
  const relLines = rels
    .filter((r) => keep(r.documentId ?? null))
    .map((r) => {
      const ev = r.documentId ? nameOf.get(r.documentId) : null;
      return `- ${r.sourceEntity?.canonicalName ?? '?'} **${r.relationshipType}** ${r.targetEntity?.canonicalName ?? '?'}${ev ? ` (evidence: ${ev})` : ''}`;
    });
  const relationships = relLines.length ? relLines.slice(0, CAP_RELATIONSHIPS).join('\n') + (relLines.length > CAP_RELATIONSHIPS ? `\n- _+${relLines.length - CAP_RELATIONSHIPS} more_` : '') : '_No inter-document relationships identified yet._';

  return { parties, clauses, dates, anomalies, registry, relationships, docCount, portfolioRisk };
}

/** Render Claude's Top Risks synthesis into markdown. */
const renderTopRisks = (risks: BriefSynthesis['topRisks']): string =>
  risks.length
    ? risks.map((r, i) => `${i + 1}. ${r.title} ([${r.docName}${r.page ? ` p.${r.page}` : ''}]) — ${r.riskLevel}. ${r.rationale}`).join('\n')
    : '_No material risks identified yet._';

/**
 * Assemble the full brief markdown in the canonical section order. Human sections
 * are emitted as default placeholders; the caller splices stored content back in.
 */
export function assembleBrief(args: {
  projectName: string;
  scopeKey: string;
  synthesis: BriefSynthesis;
  sections: DeterministicSections;
}): string {
  const { synthesis: s, sections: d } = args;
  const risk = s.portfolioRiskScore ?? d.portfolioRisk;
  return `---
project: ${args.projectName}
last_updated: ${new Date().toISOString()}
doc_count: ${d.docCount}
portfolio_risk: ${risk ?? '—'}
scope: ${args.scopeKey}
---

<!-- ai:start:snapshot -->
# Deal Snapshot
${s.snapshot}
<!-- ai:end:snapshot -->

<!-- human:start:team-notes -->
# Deal Team Notes
<!-- Add your own context. Preserved across AI rebuilds. -->
<!-- human:end:team-notes -->

<!-- ai:start:parties -->
# Parties
${d.parties}
<!-- ai:end:parties -->

<!-- ai:start:clauses -->
# Key Clauses (cross-document)
${d.clauses}
<!-- ai:end:clauses -->

<!-- ai:start:risks -->
# Top Risks
${renderTopRisks(s.topRisks)}
<!-- ai:end:risks -->

<!-- ai:start:dates -->
# Key Dates
${d.dates}
<!-- ai:end:dates -->

<!-- human:start:custom-context -->
# Custom Context
<!-- Deal team can add here: rationale, carve-outs, prior dealings, etc. -->
<!-- human:end:custom-context -->

<!-- ai:start:anomalies -->
# Cross-document Anomalies
${d.anomalies}
<!-- ai:end:anomalies -->

<!-- ai:start:registry -->
# Document Registry
${d.registry}
<!-- ai:end:registry -->

<!-- ai:start:relationships -->
# Inter-document Relationships
${d.relationships}
<!-- ai:end:relationships -->
`;
}
