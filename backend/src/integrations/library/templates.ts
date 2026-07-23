/**
 * Static + derived markdown written into a project's library at seed time:
 *   - CLAUDE.md      the operating manual (how the library is laid out + queried)
 *   - checklist.md   a human-readable render of the canonical checklist
 *
 * Per-node and per-index rendering lives in library-writer.service.ts; this
 * module holds only the project-level, mostly-static documents.
 */

import { WORKSTREAMS, itemsForWorkstream } from './checklist';

export const LIBRARY_CLAUDE_MD = `# Deal Library — operating manual

This library is the knowledge base for one deal. It is a tree of markdown files.
Read it by **navigating the table of contents and following links** — do not
load every file. This is what keeps queries cheap.

## Layout

\`\`\`
library/
  CLAUDE.md          this file
  index.md           master ToC: workstreams → items → live coverage status
  checklist.md       the canonical diligence checklist (editable per project)
  log.md             append-only ingestion history
  workstreams/
    NN-<slug>/
      _index.md      workstream rollup: its items + statuses
      <item-slug>/
        _index.md    the diligence QUESTION + coverage status + evidence rollup
        <evidence>.md  Tier-3 evidence node (a clause instance, risk, or date)
  entities/          canonical companies / people / jurisdictions / amounts
  sources/           one node per ingested document (provenance hub)
  risks/             risk register (aggregates RISK nodes by reference)
\`\`\`

## Tiers

- **Tier 1 — Workstream**: 12 legal/diligence categories (Corporate, IP, …).
- **Tier 2 — Checklist item**: the diligence *question*. Pre-seeded as a slot
  with a coverage status, so open questions are visible before any evidence exists.
- **Tier 3 — Evidence node**: a specific clause instance, risk, or date, with its
  source document, page, and a verbatim quote.

## Coverage status (on each Tier-2 \`_index.md\`)

- **OPEN** — no evidence found yet. This is a gap: an unanswered diligence question.
- **COVERED** — evidence found, consistent with the playbook / no red flag.
- **FLAGGED** — evidence found that deviates from the playbook or is HIGH risk.
- **THIN** — some evidence but likely incomplete.
- **NA** — not applicable to this deal.

## How to answer a question

1. Open \`index.md\`, find the relevant workstream and item.
2. Open that item's \`_index.md\` for the rollup and the list of evidence nodes.
3. Open only the evidence nodes you need; each cites its source + page + quote.
4. Follow \`links:\` in a node to reach related provisions, entities, and the source.

## How ingestion updates the library

Each ingested document is decomposed into evidence nodes, each filed under the
checklist item its clause type answers (deterministic mapping). Nodes link to
their source and the entities they mention. Item coverage status is recomputed
from the evidence. Nothing is dropped — unmapped clauses land under
\`workstreams/99-to-triage/\`.

## Conventions

- Links are relative markdown links. A node's \`links:\` front-matter lists related
  node paths.
- Every evidence node cites a page and quotes verbatim. Never invent a quote.
- Human-authored notes belong in files/sections marked human-editable; ingestion
  never overwrites them.
`;

/** Render the canonical checklist as a human-readable markdown document. */
export const renderChecklistMarkdown = (): string => {
  const lines: string[] = [
    '# Diligence Checklist',
    '',
    'The table of contents for this deal library. Tier 1 = workstream, Tier 2 =',
    'checklist item (the diligence question). Bracketed CUAD types indicate which',
    'extracted clause types file as evidence under an item; items without them are',
    'answered by facts, entities, and risk findings.',
    '',
  ];

  for (const ws of WORKSTREAMS) {
    lines.push(`## ${ws.order}. ${ws.title}`, '');
    for (const item of itemsForWorkstream(ws.id)) {
      const cuad = item.cuadTypes.length
        ? ` \`[${item.cuadTypes.join(', ')}]\``
        : item.factFed
          ? ' _(fact-fed)_'
          : '';
      lines.push(`- **${item.title}**${cuad} — ${item.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};
