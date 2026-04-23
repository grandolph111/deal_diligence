/**
 * Deal-brief marker utilities.
 *
 * The brief is a single markdown file with two kinds of sections:
 *   - AI-regenerated:    <!-- ai:start:<id> --> ... <!-- ai:end:<id> -->
 *   - Human-editable:    <!-- human:start:<id> --> ... <!-- human:end:<id> -->
 *
 * AI regeneration produces a fresh markdown. The renderer then splices in
 * the previous brief's human sections byte-for-byte, so Claude never sees
 * or modifies human edits.
 */

export const HUMAN_SECTION_IDS = ['team-notes', 'custom-context'] as const;
export type HumanSectionId = (typeof HUMAN_SECTION_IDS)[number];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sectionRegex = (kind: 'ai' | 'human', id: string) => {
  const open = escapeRegExp(`<!-- ${kind}:start:${id} -->`);
  const close = escapeRegExp(`<!-- ${kind}:end:${id} -->`);
  return new RegExp(`${open}([\\s\\S]*?)${close}`, 'g');
};

/**
 * Extract all human sections from a brief markdown into a map keyed by
 * section id. Missing sections are omitted from the result.
 */
export const extractHumanSections = (
  markdown: string | null | undefined
): Record<string, string> => {
  if (!markdown) return {};
  const out: Record<string, string> = {};
  for (const id of HUMAN_SECTION_IDS) {
    const re = sectionRegex('human', id);
    const match = re.exec(markdown);
    if (match) out[id] = match[1];
  }
  return out;
};

/**
 * Replace each human section in a freshly generated brief with stored content
 * from the previous brief. If the previous content is missing for a section,
 * leave the brief's placeholder untouched.
 */
export const spliceHumanSections = (
  markdown: string,
  stored: Record<string, string>
): string => {
  let out = markdown;
  for (const id of HUMAN_SECTION_IDS) {
    if (!(id in stored)) continue;
    const re = sectionRegex('human', id);
    out = out.replace(
      re,
      `<!-- human:start:${id} -->${stored[id]}<!-- human:end:${id} -->`
    );
  }
  return out;
};

/**
 * Overwrite a single human section in-place. Used by the human-edit endpoint.
 */
export const updateHumanSection = (
  markdown: string,
  id: HumanSectionId,
  newContent: string
): string => {
  const re = sectionRegex('human', id);
  if (!re.test(markdown)) {
    throw new Error(`Human section "${id}" not found in brief`);
  }
  return markdown.replace(
    sectionRegex('human', id),
    `<!-- human:start:${id} -->${newContent}<!-- human:end:${id} -->`
  );
};
