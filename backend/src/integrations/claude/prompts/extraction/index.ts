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


/**
 * Anchor-mode instructions.
 *
 * Deliberately explicit about superseding the verbatim-quote rule in the shared
 * preamble: the two instructions genuinely conflict, and a model given a
 * contradiction without a stated precedence will satisfy whichever it read most
 * recently — which is exactly the kind of silent, intermittent behaviour that
 * makes prompt regressions hard to attribute.
 *
 * Only rendered when the document has a text layer to resolve against. A scan
 * keeps the verbatim contract, because there is nothing to slice a span out of.
 */
export const ANCHOR_MODE_BLOCK = `
<anchor_mode>
# Clause quoting: ANCHOR MODE

Do NOT write out the full clause text in \`clauses[].content\`. Leave \`content\` empty.

Instead, for every clause give two short locators:
- \`startAnchor\` — the FIRST 8 to 12 words of the clause, copied exactly.
- \`endAnchor\` — the LAST 8 to 12 words of the clause, copied exactly.

The full text is recovered automatically from the source document by locating
these two anchors, so the quote you would have written is still produced — you
simply do not have to type it. This is the single biggest driver of how long
this extraction takes, so keep anchors short.

Rules that matter:
- Both anchors must be copied CHARACTER-FOR-CHARACTER from the document. They
  are searched for literally. A paraphrased anchor finds nothing and the clause
  is reported as unresolved.
- Pick an anchor that is DISTINCTIVE — this is the single most important rule.
  The anchor is used as a literal search key, and the FIRST match wins. "The
  parties agree that" or "Notwithstanding the foregoing" appear dozens of times
  in a contract; an anchor like that will resolve to some other clause entirely,
  and the resulting quote will be wrong while looking perfectly plausible.
  "The Seller shall indemnify, defend and hold harmless" appears once. If the
  opening words of a clause are generic, extend the anchor further into the
  sentence until it is unique in the document, or start it at the first
  distinctive phrase instead of the first word.
- Before giving an anchor, ask: "if I searched the whole document for this exact
  string, would I get one hit or several?" If several, it is not usable.
- \`startAnchor\` must come before \`endAnchor\` in the document, and both must be
  on or near the \`pageNumber\` you cite.
- If a clause is so short that the start and end overlap, give the whole clause
  as \`startAnchor\` and leave \`endAnchor\` empty.
- If you genuinely cannot produce reliable anchors for a clause, fall back to
  writing the verbatim quote in \`content\` for that clause only.

Everything else is unchanged: same clause types, same page citations, same risk
ratings, same rigour about not inventing clauses.
</anchor_mode>
`;

/**
 * Default quoting mechanism: the full verbatim span.
 *
 * Used when there is no text layer to resolve anchors against — a scan. Paired
 * with ANCHOR_MODE_BLOCK so exactly one mechanism is ever present in the prompt:
 * the shared preamble states the invariant (a clause must be locatable by exact
 * text), and precisely one block states how to satisfy it. That is what keeps
 * the two from contradicting each other.
 */
export const QUOTE_MODE_BLOCK = `
<quoting>
# Clause quoting: FULL QUOTE

Put the clause's operative language in \`content\` as an EXACT, CONTIGUOUS,
character-for-character quote from the document — never a paraphrase, never
stitched-together fragments. It must appear word-for-word on its cited page so
it can be grounded against the source. Quote the operative portion (you do not
need the entire clause), but every character must match.

Choose a portion that is DISTINCTIVE. A quote that also appears verbatim
elsewhere in the document cannot be used to identify this clause.
</quoting>
`;

export const buildExtractionPrompt = (args: {
  documentType: DocumentType;
  playbook?: Playbook | null;
  companyPlaybookMarkdown?: string | null;
  /** Emit locators instead of full quotes. Requires a resolvable text layer. */
  anchorMode?: boolean;
}): string => {
  return [
    EXTRACTION_SHARED_PREAMBLE,
    FEW_SHOT_EXAMPLES,
    buildTypeBlock(args.documentType),
    args.anchorMode ? ANCHOR_MODE_BLOCK : QUOTE_MODE_BLOCK,
    renderCompanyPlaybookBlock(args.companyPlaybookMarkdown),
    renderPlaybookBlock(args.playbook ?? null),
  ].join('\n');
};
