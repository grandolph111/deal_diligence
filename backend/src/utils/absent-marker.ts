/**
 * Does this clause text record an ABSENCE rather than a provision?
 *
 * Extraction is asked to report a clause type only when operative language is
 * present, and to treat absence as a valid finding. Some models still emit the
 * finding as a clause ("ABSENT - no change-of-control provision found", quote
 * "Not present in this document."). Filed as evidence, that reads as a clause
 * that exists, which is the single most dangerous error the platform can make:
 * a recorded absence closing out a diligence question, or worse, appearing as a
 * flagged issue in a report a client reads.
 *
 * Filtered at persist, and again when the report is assembled. Two checks for
 * one failure, because the second one is the one a client would see.
 */
export const isAbsentMarkerClause = (content: string | null | undefined): boolean => {
  const t = (content ?? '').trim();
  if (t.length < 3) return true;
  if (/^present:\s*no\b/i.test(t)) return true;
  if (/^not\s+(present|found|applicable|specified|included|disclosed)\b/i.test(t)) return true;
  const head = t.slice(0, 180);
  return (
    /^(no\b|there (is|are) no\b)/i.test(head) &&
    /\b(provision|clause|language|section)\b/i.test(head) &&
    /\b(present|found|exist|appears?|applicable|contained|anywhere|in this (agreement|contract))\b/i.test(head)
  );
};

/** Same question, asked of a stored node that carries a title as well. */
export const isAbsentMarkerNode = (node: {
  title?: string | null;
  content?: string | null;
}): boolean =>
  isAbsentMarkerClause(node.content) || /^\s*absent\b/i.test(node.title ?? '');
