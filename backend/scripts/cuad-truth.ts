/**
 * Authoritative CUAD ground truth, read directly from CUAD_v1/labels/CUAD_v1.json
 * (the canonical SQuAD-format annotations) — NOT the hand-derived gold.json, which
 * silently drops metadata categories and at least one clause type.
 *
 * A category is "present" for a contract iff the annotators left ≥1 answer span for
 * it (is_impossible = false). We split the 41 categories explicitly:
 *   - METADATA (5): extracted by our pipeline as structured fields (parties/dates/
 *     document name), NOT as clauses[] — scored separately, never counted as a
 *     missed clause.
 *   - CLAUSE (36): scored against clauses[].clauseType (recall/precision).
 * Answer spans are retained so callers can do span-level correctness scoring.
 */

import fs from 'fs';
import path from 'path';

const CUAD = path.resolve(__dirname, '../../CUAD_v1');

/** The 5 categories our pipeline emits as structured fields, not clauses. */
export const METADATA_CATEGORIES = new Set([
  'Document Name', 'Parties', 'Agreement Date', 'Effective Date', 'Expiration Date',
]);

export interface ContractTruth {
  clause: Set<string>;          // present clause categories (score vs clauses[])
  metadata: Set<string>;        // present metadata categories (score vs structured fields)
  spans: Map<string, string[]>; // category -> annotator answer text spans (span-level scoring)
}

/** Normalize a filename or CUAD title to a comparable base key (drop .pdf, lowercase). */
export const truthKey = (nameOrTitle: string): string => nameOrTitle.replace(/\.pdf$/i, '').toLowerCase().trim();

export function loadCuadTruth(): Map<string, ContractTruth> {
  const cuad = JSON.parse(fs.readFileSync(path.join(CUAD, 'labels/CUAD_v1.json'), 'utf8')) as {
    data: Array<{ title: string; paragraphs: Array<{ qas: Array<{ question: string; answers: Array<{ text: string }>; is_impossible?: boolean }> }> }>;
  };
  const out = new Map<string, ContractTruth>();
  for (const d of cuad.data) {
    const clause = new Set<string>();
    const metadata = new Set<string>();
    const spans = new Map<string, string[]>();
    for (const p of d.paragraphs) {
      for (const qa of p.qas) {
        const m = qa.question.match(/"([^"]+)"/);
        if (!m) continue;
        const cat = m[1];
        const texts = (qa.answers || []).map((a) => a.text).filter(Boolean);
        if (!texts.length) continue; // absent for this contract
        spans.set(cat, texts);
        if (METADATA_CATEGORIES.has(cat)) metadata.add(cat);
        else clause.add(cat);
      }
    }
    out.set(truthKey(d.title), { clause, metadata, spans });
  }
  return out;
}

// --- matcher: our enum name <-> CUAD category label ---
const DROP = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'to', 'for']);
const norm = (s: string): string => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !DROP.has(t)).join('');
const ALIASES: string[][] = [
  ['Unlimited/All-You-Can-Eat-License', 'UNLIMITED_LICENSE', 'ALL_YOU_CAN_EAT_LICENSE'],
  ['Rofr/Rofo/Rofn', 'ROFR_ROFO_ROFN', 'RIGHT_OF_FIRST_REFUSAL', 'RIGHT_OF_FIRST_OFFER'],
  ['Ip Ownership Assignment', 'IP_OWNERSHIP_ASSIGNMENT'],
  ['Joint Ip Ownership', 'JOINT_IP_OWNERSHIP'],
  ['Non-Transferable License', 'NON_TRANSFERABLE_LICENSE'],
  ['Irrevocable Or Perpetual License', 'IRREVOCABLE_OR_PERPETUAL_LICENSE'],
  ['Post-Termination Services', 'POST_TERMINATION_SERVICES'],
  ['Covenant Not To Sue', 'COVENANT_NOT_TO_SUE'],
  ['Most Favored Nation', 'MOST_FAVORED_NATION'],
  ['No-Solicit Of Employees', 'NO_SOLICIT_EMPLOYEES'],
  ['No-Solicit Of Customers', 'NO_SOLICIT_CUSTOMERS'],
];
const canon = new Map<string, string>();
for (const grp of ALIASES) { const key = norm(grp[0]); for (const t of grp) canon.set(norm(t), key); }
const canonOf = (s: string): string => { const n = norm(s); return canon.get(n) ?? n; };
export const matches = (a: string, b: string): boolean => {
  const [x, y] = [canonOf(a), canonOf(b)];
  return x === y || (Math.min(x.length, y.length) > 6 && (x.includes(y) || y.includes(x)));
};

/**
 * Span-level correctness: does our extracted quote overlap any annotator span for
 * that category? Normalized-substring overlap (either direction) on a long-enough
 * shared window — deliberately lenient, since our quote is the operative portion and
 * need not match the annotator's exact boundaries.
 */
const normText = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
export const spanOverlap = (ourQuote: string, goldSpans: string[]): boolean => {
  const q = normText(ourQuote);
  if (q.length < 12) return false;
  for (const g of goldSpans) {
    const gg = normText(g);
    if (gg.length < 12) continue;
    // shared 24-char window in either direction
    const [short, long] = q.length < gg.length ? [q, gg] : [gg, q];
    if (long.includes(short)) return true;
    for (let i = 0; i + 24 <= short.length; i += 8) {
      if (long.includes(short.slice(i, i + 24))) return true;
    }
  }
  return false;
};
