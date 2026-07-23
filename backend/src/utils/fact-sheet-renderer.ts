/**
 * Deterministic fact-sheet renderer.
 *
 * The extraction model used to *write* a markdown fact sheet — re-typing every
 * clause quote a second and third time (Key Clauses + Citations), ~3-4k output
 * tokens of pure duplication that dominated extraction latency. Now the model
 * emits only the structured fields and we render the same markdown here, for
 * free and instantly. Consumers (VDR chat, deal brief, library) read this
 * unchanged; it's just assembled instead of generated.
 */

import type { ExtractionResponse } from '../integrations/claude/schema';

const line = (s: string) => s;
const nn = (v: unknown) => (v == null || v === '' ? 'null' : String(v));

export const renderFactSheet = (e: ExtractionResponse, filename: string): string => {
  const parties = (e.parties ?? []).filter(Boolean);
  const dealValue =
    e.dealValue != null ? `${e.dealValue}${e.currency ? ` ${e.currency}` : ''}` : 'null';

  const frontmatter = [
    '---',
    `document_name: ${filename}`,
    `document_type: ${nn(e.documentType)}`,
    `parties: [${parties.join(', ')}]`,
    `effective_date: ${nn(e.effectiveDate)}`,
    `governing_law: ${nn(e.governingLaw)}`,
    `deal_value: ${dealValue}`,
    `risk_score: ${e.riskScore}`,
    `risk_level: ${nn(e.riskLevel)}`,
    `page_count: ${nn(e.pageCount)}`,
    '---',
  ].join('\n');

  const summary = [
    '# Executive Summary',
    `This is a ${nn(e.documentType)}${parties.length ? ` between ${parties.join(' and ')}` : ''}.` +
      (e.riskSummary ? ` ${e.riskSummary}` : ''),
  ].join('\n');

  const risk = [
    '# Risk Assessment',
    `**Overall: ${e.riskScore}/10 (${nn(e.riskLevel)})**${e.riskSummary ? ` — ${e.riskSummary}` : ''}`,
  ].join('\n');

  const highRisks = (e.clauses ?? []).filter((c) => c.riskLevel === 'HIGH');
  const topRisks = highRisks.length
    ? [
        '## Top Risks',
        ...highRisks.map(
          (c, i) =>
            `${i + 1}. **${c.title || c.clauseType}** (severity: high${c.pageNumber ? `, page ${c.pageNumber}` : ''})`
        ),
      ].join('\n')
    : '';

  const clauses = [
    '# Key Clauses (CUAD-aligned)',
    ...(e.clauses ?? []).map((c) =>
      [
        `\n## ${c.title || c.clauseType}`,
        `- **Type**: ${c.clauseType}`,
        `- **Page**: ${nn(c.pageNumber)}`,
        `- **Risk**: ${nn(c.riskLevel)}`,
        `- **Quote**: "${(c.content || '').replace(/\s+/g, ' ').trim()}"`,
      ].join('\n')
    ),
  ].join('\n');

  // Entities grouped by type.
  const byType = new Map<string, string[]>();
  for (const ent of e.entities ?? []) {
    const t = (ent.type || 'OTHER').toUpperCase();
    const arr = byType.get(t) ?? [];
    arr.push(`- ${ent.text}${ent.pageNumber ? ` (page ${ent.pageNumber})` : ''}`);
    byType.set(t, arr);
  }
  const entities =
    byType.size > 0
      ? ['# Entities', ...[...byType.entries()].map(([t, items]) => `\n## ${t}\n${items.join('\n')}`)].join('\n')
      : '';

  const relationships = (e.relationships ?? []).length
    ? [
        '# Relationships (intra-document)',
        ...(e.relationships ?? []).map(
          (r) => `- \`${r.sourceText}\` **${r.relationshipType}** \`${r.targetText}\`${r.pageNumber ? ` (page ${r.pageNumber})` : ''}`
        ),
      ].join('\n')
    : '';

  return [frontmatter, summary, risk, topRisks, clauses, entities, relationships]
    .filter((s) => line(s).trim().length > 0)
    .join('\n\n');
};
