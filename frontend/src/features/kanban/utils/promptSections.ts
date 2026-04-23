/**
 * A task's `aiPrompt` field is a single string that we structure into three
 * sections via markdown headers so we don't need a schema migration:
 *
 *   ## Objective
 *   <what the AI should do>
 *
 *   ## Hints & constraints
 *   <style, tone, things to watch for>
 *
 *   ## Expected output
 *   <format / deliverable shape>
 *
 * `parsePrompt` reads a string into the three parts; `composePrompt` serializes
 * them back into the header-delimited format. Legacy prompts that predate the
 * split land entirely in `objective`.
 */

export interface PromptSections {
  objective: string;
  hints: string;
  output: string;
}

const OBJECTIVE_HEADER = '## Objective';
const HINTS_HEADER = '## Hints & constraints';
const OUTPUT_HEADER = '## Expected output';

export function parsePrompt(raw: string | null | undefined): PromptSections {
  if (!raw || !raw.trim()) {
    return { objective: '', hints: '', output: '' };
  }

  const hasStructure =
    raw.includes(OBJECTIVE_HEADER) ||
    raw.includes(HINTS_HEADER) ||
    raw.includes(OUTPUT_HEADER);

  if (!hasStructure) {
    // Unstructured legacy prompt — treat the whole thing as the objective.
    return { objective: raw.trim(), hints: '', output: '' };
  }

  const extract = (header: string, nextHeaders: string[]): string => {
    const start = raw.indexOf(header);
    if (start === -1) return '';
    const bodyStart = start + header.length;
    let end = raw.length;
    for (const next of nextHeaders) {
      const idx = raw.indexOf(next, bodyStart);
      if (idx !== -1 && idx < end) end = idx;
    }
    return raw.slice(bodyStart, end).trim();
  };

  return {
    objective: extract(OBJECTIVE_HEADER, [HINTS_HEADER, OUTPUT_HEADER]),
    hints: extract(HINTS_HEADER, [OBJECTIVE_HEADER, OUTPUT_HEADER]),
    output: extract(OUTPUT_HEADER, [OBJECTIVE_HEADER, HINTS_HEADER]),
  };
}

export function composePrompt(sections: PromptSections): string {
  const parts: string[] = [];
  if (sections.objective.trim()) {
    parts.push(`${OBJECTIVE_HEADER}\n${sections.objective.trim()}`);
  }
  if (sections.hints.trim()) {
    parts.push(`${HINTS_HEADER}\n${sections.hints.trim()}`);
  }
  if (sections.output.trim()) {
    parts.push(`${OUTPUT_HEADER}\n${sections.output.trim()}`);
  }
  return parts.join('\n\n');
}

export function hasAnyContent(sections: PromptSections): boolean {
  return (
    sections.objective.trim().length > 0 ||
    sections.hints.trim().length > 0 ||
    sections.output.trim().length > 0
  );
}
