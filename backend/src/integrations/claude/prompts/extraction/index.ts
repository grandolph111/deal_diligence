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

export const buildExtractionPrompt = (args: {
  documentType: DocumentType;
  playbook?: Playbook | null;
}): string => {
  return [
    EXTRACTION_SHARED_PREAMBLE,
    FEW_SHOT_EXAMPLES,
    buildTypeBlock(args.documentType),
    renderPlaybookBlock(args.playbook ?? null),
  ].join('\n');
};
