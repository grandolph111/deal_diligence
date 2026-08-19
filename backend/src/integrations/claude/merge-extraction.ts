/**
 * Deterministic merge of per-window extractions into one document-level result.
 *
 * The split of labour here is deliberate: **lists are merged in code, judgment
 * is merged by the model** (see `consolidate.ts`). Deduping clauses is a
 * mechanical string problem with a right answer, and paying a model to do it
 * would be slower, costlier, and less repeatable. Deciding whether a contract
 * carrying eight windows' worth of findings is a 6/10 or an 8/10 is not
 * mechanical, and averaging per-window scores would be meaningless — a document
 * is not the mean of its fortieths.
 */

import type { PageWindow } from '../../utils/pdf-window';
import { toAbsolutePage } from '../../utils/pdf-window';
import type { ExtractionResponse } from './schema';

export interface WindowExtraction {
  window: PageWindow;
  extraction: ExtractionResponse;
  /**
   * True when the model already saw absolute page numbers and its citations
   * need no correction — the page-marked text path, where `=== Page N ===`
   * markers carry document-truth. False for the sliced-PDF path, where each
   * window is a fresh PDF numbered from 1 and the offset must be added back.
   *
   * Getting this backwards silently corrupts every citation in the document,
   * so it is required rather than defaulted.
   */
  pagesAreAbsolute: boolean;
}

/** Correct a window-relative page to document-absolute, unless already absolute. */
const resolvePage = (
  page: number | null | undefined,
  item: { window: PageWindow; pagesAreAbsolute: boolean }
): number | null =>
  item.pagesAreAbsolute ? page ?? null : toAbsolutePage(page, item.window);

/** Collapse case, whitespace, and edge punctuation for comparison purposes. */
const normalize = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();

/** Comparison key for a clause quote — long enough to separate real siblings. */
const QUOTE_KEY_LENGTH = 180;

const mode = <T>(values: T[]): T | undefined => {
  const counts = new Map<string, { value: T; n: number; firstAt: number }>();
  values.forEach((value, i) => {
    const k = typeof value === 'string' ? normalize(value) : JSON.stringify(value);
    if (!k) return;
    const existing = counts.get(k);
    if (existing) existing.n += 1;
    else counts.set(k, { value, n: 1, firstAt: i });
  });
  let best: { value: T; n: number; firstAt: number } | undefined;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n || (entry.n === best.n && entry.firstAt < best.firstAt)) {
      best = entry;
    }
  }
  return best?.value;
};

const nonEmpty = <T>(values: (T | null | undefined)[]): T[] =>
  values.filter((v): v is T => v !== null && v !== undefined && v !== ('' as unknown as T));

const RISK_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
type RiskLevel = keyof typeof RISK_RANK;

const highestRisk = (levels: (string | null | undefined)[]): RiskLevel | undefined => {
  let best: RiskLevel | undefined;
  for (const level of levels) {
    if (!level || !(level in RISK_RANK)) continue;
    const l = level as RiskLevel;
    if (!best || RISK_RANK[l] > RISK_RANK[best]) best = l;
  }
  return best;
};

type Clause = ExtractionResponse['clauses'][number];
type Entity = ExtractionResponse['entities'][number];
type Relationship = ExtractionResponse['relationships'][number];

/**
 * Merge clauses across windows.
 *
 * Two passes, because overlap produces two different kinds of duplicate. Exact
 * re-reports collapse on a normalized-prefix key. But a clause cut by a window
 * boundary comes back *truncated* from one window and *whole* from the other,
 * which the prefix key sees as distinct — so within a clause type we also fold
 * any quote fully contained in a longer one, keeping the longer.
 */
const mergeClauses = (
  items: Array<{ clause: Clause; window: PageWindow; pagesAreAbsolute: boolean }>
): Clause[] => {
  const byKey = new Map<string, Clause>();

  for (const item of items) {
    const { clause } = item;
    const absolutePage = resolvePage(clause.pageNumber, item);
    const candidate: Clause = { ...clause, pageNumber: absolutePage };
    const key = `${normalize(clause.clauseType)}|${normalize(clause.content).slice(0, QUOTE_KEY_LENGTH)}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    // Same clause seen twice in the overlap: keep the more complete quote, the
    // higher confidence, the more severe risk, and the earliest page.
    byKey.set(key, {
      ...existing,
      content:
        candidate.content.length > existing.content.length
          ? candidate.content
          : existing.content,
      title: existing.title ?? candidate.title,
      confidence: Math.max(existing.confidence, candidate.confidence),
      riskLevel: highestRisk([existing.riskLevel, candidate.riskLevel]) ?? existing.riskLevel,
      pageNumber:
        existing.pageNumber != null && candidate.pageNumber != null
          ? Math.min(existing.pageNumber, candidate.pageNumber)
          : existing.pageNumber ?? candidate.pageNumber,
    });
  }

  // Containment pass: fold truncated boundary quotes into their whole version.
  const merged = [...byKey.values()];
  const byType = new Map<string, Clause[]>();
  for (const clause of merged) {
    const t = normalize(clause.clauseType);
    const bucket = byType.get(t);
    if (bucket) bucket.push(clause);
    else byType.set(t, [clause]);
  }

  const kept: Clause[] = [];
  for (const bucket of byType.values()) {
    // Longest first, so a shorter fragment is always tested against the whole.
    const sorted = [...bucket].sort((a, b) => b.content.length - a.content.length);
    const survivors: Array<{ clause: Clause; norm: string }> = [];
    for (const clause of sorted) {
      const norm = normalize(clause.content);
      // Very short quotes are not reliable containment evidence — a two-word
      // fragment is inside half the document. Keep them as their own clause.
      const contained =
        norm.length >= 40 && survivors.some((s) => s.norm.includes(norm));
      if (!contained) survivors.push({ clause, norm });
    }
    kept.push(...survivors.map((s) => s.clause));
  }

  // Restore document order so the fact sheet reads front-to-back.
  return kept.sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
};

const mergeEntities = (
  items: Array<{ entity: Entity; window: PageWindow; pagesAreAbsolute: boolean }>
): Entity[] => {
  const byKey = new Map<string, Entity>();
  for (const item of items) {
    const { entity } = item;
    const key = `${normalize(entity.type)}|${normalize(entity.normalizedText || entity.text)}`;
    if (!key.replace('|', '').trim()) continue;
    const candidate: Entity = {
      ...entity,
      pageNumber: resolvePage(entity.pageNumber, item),
    };
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    byKey.set(key, {
      ...existing,
      normalizedText: existing.normalizedText ?? candidate.normalizedText,
      confidence: Math.max(existing.confidence, candidate.confidence),
      // First mention is the useful citation for an entity.
      pageNumber:
        existing.pageNumber != null && candidate.pageNumber != null
          ? Math.min(existing.pageNumber, candidate.pageNumber)
          : existing.pageNumber ?? candidate.pageNumber,
    });
  }
  return [...byKey.values()];
};

const mergeRelationships = (
  items: Array<{ relationship: Relationship; window: PageWindow; pagesAreAbsolute: boolean }>
): Relationship[] => {
  const byKey = new Map<string, Relationship>();
  for (const item of items) {
    const { relationship } = item;
    const key = [
      normalize(relationship.sourceType),
      normalize(relationship.sourceText),
      normalize(relationship.relationshipType),
      normalize(relationship.targetType),
      normalize(relationship.targetText),
    ].join('|');
    const candidate: Relationship = {
      ...relationship,
      pageNumber: resolvePage(relationship.pageNumber, item),
    };
    const existing = byKey.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
};

/** Union of party names, deduped case-insensitively, first spelling wins. */
const mergeParties = (lists: string[][]): string[] => {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const party of list) {
      const key = normalize(party);
      if (key && !seen.has(key)) seen.set(key, party);
    }
  }
  return [...seen.values()];
};

export interface MergeStats {
  windows: number;
  clausesBeforeMerge: number;
  clausesAfterMerge: number;
  entitiesBeforeMerge: number;
  entitiesAfterMerge: number;
}

export interface MergeResult {
  extraction: ExtractionResponse;
  stats: MergeStats;
}

/**
 * Fold per-window extractions into one document-level `ExtractionResponse`.
 *
 * Scalar fields use the *mode* rather than the first non-null value: with eight
 * windows voting, a governing-law clause misread in one window loses to the
 * seven that read it correctly. First occurrence breaks ties, so a two-window
 * document still behaves like "trust the earlier window".
 *
 * `riskScore` and `confidenceScore` here are only a deterministic floor — the
 * consolidation pass overwrites them with a judgment made over the whole
 * merged clause set. They matter when consolidation is unavailable (mock mode,
 * or a consolidation failure we chose to survive rather than fail on).
 */
export const mergeWindowExtractions = (
  results: WindowExtraction[],
  documentPageCount: number | null
): MergeResult => {
  if (results.length === 0) {
    throw new Error('mergeWindowExtractions: no window results to merge');
  }

  const clauseItems = results.flatMap((r) =>
    r.extraction.clauses.map((clause) => ({
      clause,
      window: r.window,
      pagesAreAbsolute: r.pagesAreAbsolute,
    }))
  );
  const entityItems = results.flatMap((r) =>
    r.extraction.entities.map((entity) => ({
      entity,
      window: r.window,
      pagesAreAbsolute: r.pagesAreAbsolute,
    }))
  );
  const relationshipItems = results.flatMap((r) =>
    r.extraction.relationships.map((relationship) => ({
      relationship,
      window: r.window,
      pagesAreAbsolute: r.pagesAreAbsolute,
    }))
  );

  const clauses = mergeClauses(clauseItems);
  const entities = mergeEntities(entityItems);
  const relationships = mergeRelationships(relationshipItems);

  const each = <K extends keyof ExtractionResponse>(key: K) =>
    results.map((r) => r.extraction[key]);

  const extraction: ExtractionResponse = {
    factSheet: '', // rendered deterministically downstream
    documentType: mode(nonEmpty(each('documentType') as (string | null)[])) ?? null,
    // Deterministic floor only; consolidation replaces this.
    riskScore: Math.max(...results.map((r) => r.extraction.riskScore ?? 0)),
    riskLevel: highestRisk(each('riskLevel') as (string | null | undefined)[]),
    riskSummary: '',
    // Weakest window bounds our confidence in the whole.
    confidenceScore: Math.min(
      ...results.map((r) => r.extraction.confidenceScore ?? 85)
    ),
    confidenceReason: `Merged from ${results.length} page windows.`,
    parties: mergeParties(results.map((r) => r.extraction.parties)),
    effectiveDate: mode(nonEmpty(each('effectiveDate') as (string | null)[])) ?? null,
    governingLaw: mode(nonEmpty(each('governingLaw') as (string | null)[])) ?? null,
    currency: mode(nonEmpty(each('currency') as (string | null)[])) ?? null,
    dealValue: mode(nonEmpty(each('dealValue') as (number | null)[])) ?? null,
    pageCount: documentPageCount,
    language: mode(nonEmpty(each('language') as (string | null)[])) ?? null,
    region: mode(nonEmpty(each('region') as (string | null)[])) ?? null,
    entities,
    clauses,
    relationships,
  };

  return {
    extraction,
    stats: {
      windows: results.length,
      clausesBeforeMerge: clauseItems.length,
      clausesAfterMerge: clauses.length,
      entitiesBeforeMerge: entityItems.length,
      entitiesAfterMerge: entities.length,
    },
  };
};
