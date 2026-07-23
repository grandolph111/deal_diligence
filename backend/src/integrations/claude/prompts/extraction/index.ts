/**
 * Composes the full extraction prompt:
 *   SHARED_PREAMBLE + FEW_SHOT_EXAMPLES + TYPE_BLOCK + PLAYBOOK_BLOCK
 *
 * The first three are stable across all extractions and go in the cached
 * system prompt. Playbook block is per-project and also cacheable as long
 * as it doesn't change.
 */

import type { DocumentType, Playbook } from '../../schema';
import { EXTRACTION_SHARED_PREAMBLE } from './shared';
import { FEW_SHOT_EXAMPLES } from './few-shot';
import { buildTypeBlock } from './types';

export const renderPlaybookBlock = (playbook: Playbook | null | undefined): string => {
  if (!playbook) return '';
  const dealContext = playbook.dealContext
    ? `\n## Deal context\n${playbook.dealContext}\n`
    : '';
  const redFlags = playbook.redFlags.length
    ? `\n## Red flags (force HIGH on any match)\n${playbook.redFlags.map((r) => `- ${r}`).join('\n')}\n`
    : '';
  const positions = playbook.standardPositions.length
    ? `\n## Standard positions\n${playbook.standardPositions
        .map((p) => {
          const parts = [
            `### ${p.clauseType}`,
            p.preferredLanguage ? `**Preferred:** ${p.preferredLanguage}` : '',
            p.fallbacks.length
              ? `**Fallbacks:** ${p.fallbacks.map((f) => `"${f}"`).join(' | ')}`
              : '',
            `**Risk if deviates:** ${p.riskIfDeviates}`,
            p.notes ? `_Notes:_ ${p.notes}` : '',
          ].filter(Boolean);
          return parts.join('\n');
        })
        .join('\n\n')}\n`
    : '';
  return `\n<playbook>\n# Playbook (customer's preferred positions for this deal)\n${dealContext}${redFlags}${positions}\n</playbook>\n`;
};

/** Firm-wide house playbook (freeform markdown). Stable across a company's */
/** documents, so it caches with the rest of the system prompt. */
export const renderCompanyPlaybookBlock = (markdown: string | null | undefined): string => {
  if (!markdown || markdown.trim().length === 0) return '';
  return `\n<company_playbook>\n# House diligence playbook (firm-wide standing guidance)\nApply this posture to every document unless the deal-specific playbook below overrides it.\n\n${markdown.trim()}\n</company_playbook>\n`;
};

export const buildExtractionPrompt = (args: {
  documentType: DocumentType;
  playbook?: Playbook | null;
  companyPlaybookMarkdown?: string | null;
}): string => {
  return [
    EXTRACTION_SHARED_PREAMBLE,
    FEW_SHOT_EXAMPLES,
    buildTypeBlock(args.documentType),
    renderCompanyPlaybookBlock(args.companyPlaybookMarkdown),
    renderPlaybookBlock(args.playbook ?? null),
  ].join('\n');
};
