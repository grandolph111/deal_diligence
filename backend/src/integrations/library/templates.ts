/**
 * Static + derived markdown written into a project's library at seed time:
 *   - CLAUDE.md        the operating manual (how the library is laid out + queried)
 *   - categories.md    a human-readable render of the 26 risk categories
 *
 * Per-node and per-index rendering lives in library-writer.service.ts; this
 * module holds only the project-level, mostly-static documents.
 */

import { RISK_CATEGORIES } from './risk-categories';

export const LIBRARY_CLAUDE_MD = `# Deal Library — operating manual

This library is the knowledge base for one deal. It is a tree of markdown files.
Read it by **navigating the index and following links** — do not load every file.
This is what keeps queries cheap.

## Layout

\`\`\`
library/
  CLAUDE.md          this file
  index.md           master index: risk categories → live coverage status
  categories.md      the 26 risk categories and what files under each
  log.md             append-only ingestion history
  categories/
    NN-<slug>/
      _index.md      the category rollup: status + its evidence
      <evidence>.md  one clause instance, risk, or obligation
  entities/          canonical companies / people / jurisdictions / amounts
  sources/           one node per ingested document (provenance hub)
\`\`\`

## Structure

- **Risk category** — one of the 26 topics from the due-diligence issues report.
  This is the only organizing axis: navigation, access control, and the report
  itself all key off it.
- **Evidence node** — a specific clause instance, risk, or obligation, with its
  source document, page, and a verbatim quote. Filed directly under a category.

There is no question tier between the two. In the issues report a topic's rows
are the issues *found*; an unanswered topic is expressed as a supplemental
diligence request, not as an empty slot.

## Coverage status (on each category \`_index.md\`)

- **OPEN** — no evidence found yet. This is a gap: nothing in the data room
  speaks to this category, so it belongs in the supplemental diligence requests.
- **COVERED** — evidence found, consistent with the playbook / no red flag.
- **FLAGGED** — evidence found that deviates from the playbook or is HIGH risk.
- **THIN** — some evidence but all of it low-confidence; verify before relying.
- **NA** — not applicable, or delegated to another adviser.

## How to answer a question

1. Open \`index.md\` and find the relevant risk categories.
2. Open each category's \`_index.md\` for its status and evidence list.
3. Open only the evidence nodes you need; each cites its source, page, and quote.
4. Follow \`links:\` in a node to reach related provisions, entities, and sources.

## How ingestion updates the library

Each ingested document is decomposed into evidence nodes, each filed under the
risk category its clause type belongs to (a deterministic mapping). Nodes link to
their source and the entities they mention. Category coverage is recomputed from
the evidence. Nothing is dropped — a clause type with no mapping lands under
\`categories/26-other-red-flags/\`, which is the report's own catch-all topic.

## Conventions

- Links are relative markdown links. A node's \`links:\` front-matter lists related
  node paths.
- Every evidence node cites a page and quotes verbatim. Never invent a quote.
- Human-authored notes belong in files/sections marked human-editable; ingestion
  never overwrites them.
`;

/** Render the 26 risk categories as a human-readable markdown document. */
export const renderCategoriesMarkdown = (): string => {
  const lines: string[] = [
    '# Risk Categories',
    '',
    'The spine of this deal library, taken from the due-diligence issues report —',
    'the deliverable a firm hands its client. Each category carries a coverage',
    'status. Bracketed clause types file as evidence under a category; categories',
    'without them are fact-fed, answered by documents, facts, and entities rather',
    'than by contract clause language.',
    '',
  ];

  for (const cat of RISK_CATEGORIES) {
    lines.push(`## ${cat.order}. ${cat.title}`, '');
    lines.push(`_Report topic:_ ${cat.reportTitle}`, '');
    lines.push(cat.description, '');
    lines.push(
      cat.clauseTypes.length
        ? `**Clause types filed here:** \`${cat.clauseTypes.join('`, `')}\``
        : '**Fact-fed** — no clause type maps here.',
      ''
    );
  }

  return lines.join('\n');
};
