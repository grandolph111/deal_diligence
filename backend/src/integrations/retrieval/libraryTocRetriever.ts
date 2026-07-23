/**
 * Library ToC retriever — the "read the index, follow the links" retrieval.
 *
 * Instead of stuffing every in-scope fact sheet, this navigates the diligence
 * checklist:
 *   1. Build the scoped checklist index (items with evidence, their status +
 *      clause types).
 *   2. Route the question to the relevant items (Haiku; keyword fallback in mock
 *      mode).
 *   3. Return only the fact sheets of the source documents behind those items,
 *      plus a coverage summary that names any OPEN items so the answer can
 *      surface gaps.
 *
 * Everything is folder-scoped via `scope.folderIds` (resolved by the caller), so
 * per-scope retrieval is done at query time from the DB — no per-scope index
 * files needed.
 */

import { prisma } from '../../config/database';
import { s3Service } from '../../services/s3.service';
import { routeLibraryItems, rerankProvisions, isMock, type RouteItem } from '../claude';
import { getItem } from '../library/checklist';
import type { Retriever, DocRef, RetrievalScope } from './index';

const MAX_DOCS = 12;
const RERANK_CANDIDATES = 50; // cap on clauses the Haiku reranker reads per query
const RISK_RANK: Record<string, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
const COVERAGE_DOC_ID = 'library-coverage';

interface ScopedItem extends RouteItem {
  docIds: Set<string>;
  evidenceCount: number;
}

/** Resolve the doc ids visible to the caller (null = full access / no filter). */
async function scopedDocIds(scope: RetrievalScope): Promise<Set<string> | null> {
  if (!scope.folderIds || scope.folderIds.length === 0) return null;
  const docs = await prisma.document.findMany({
    where: { projectId: scope.projectId, folderId: { in: scope.folderIds } },
    select: { id: true },
  });
  return new Set(docs.map((d) => d.id));
}

/** Keyword fallback routing when Claude isn't available or LLM routing is empty. */
function keywordRoute(query: string | null, items: ScopedItem[]): string[] {
  if (!query) {
    // No query → the notable items: flagged/thin first, then some covered.
    return [...items]
      .sort((a, b) => rank(b.status) - rank(a.status))
      .slice(0, 8)
      .map((i) => i.id);
  }
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
  const scored = items
    .map((i) => {
      const hay = `${i.title} ${i.clauseTypes.join(' ')}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { id: i.id, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.id);
  return scored;
}

const rank = (status: string): number =>
  status === 'FLAGGED' ? 3 : status === 'THIN' ? 2 : status === 'COVERED' ? 1 : 0;

function renderCoverage(selected: ScopedItem[]): string {
  const lines = ['# Diligence coverage relevant to this question', ''];
  for (const it of selected) {
    if (it.status === 'OPEN' || it.evidenceCount === 0) {
      lines.push(`- **${it.title}** — OPEN: no evidence found yet (a diligence gap).`);
    } else {
      lines.push(`- **${it.title}** — ${it.status}, ${it.evidenceCount} piece(s) of evidence.`);
    }
  }
  lines.push('', 'Surface any OPEN items as gaps in your answer.');
  return lines.join('\n');
}

export const libraryTocRetriever: Retriever = {
  async search(query: string | null, scope: RetrievalScope): Promise<DocRef[]> {
    const allowedDocs = await scopedDocIds(scope);
    const inScope = (docId: string | null): boolean =>
      allowedDocs === null || (docId != null && allowedDocs.has(docId));

    // 1. Provisions → per-item index (scoped).
    const provisions = await prisma.libraryNode.findMany({
      where: { projectId: scope.projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] } },
      select: { itemId: true, sourceDocumentId: true, clauseType: true },
    });
    const byItem = new Map<string, { docIds: Set<string>; clauseTypes: Set<string>; count: number }>();
    for (const p of provisions) {
      if (!inScope(p.sourceDocumentId)) continue;
      const entry = byItem.get(p.itemId) ?? { docIds: new Set(), clauseTypes: new Set(), count: 0 };
      if (p.sourceDocumentId) entry.docIds.add(p.sourceDocumentId);
      if (p.clauseType) entry.clauseTypes.add(p.clauseType);
      entry.count += 1;
      byItem.set(p.itemId, entry);
    }
    if (byItem.size === 0) return []; // no library evidence in scope → caller falls back to the brief

    // Item status/title from CHECKLIST_ITEM nodes.
    const itemNodes = await prisma.libraryNode.findMany({
      where: { projectId: scope.projectId, type: 'CHECKLIST_ITEM', itemId: { in: [...byItem.keys()] } },
      select: { itemId: true, title: true, status: true },
    });
    const statusByItem = new Map(itemNodes.map((n) => [n.itemId, { title: n.title, status: n.status ?? 'OPEN' }]));

    const items: ScopedItem[] = [...byItem.entries()].map(([itemId, e]) => ({
      id: itemId,
      title: statusByItem.get(itemId)?.title ?? getItem(itemId)?.title ?? itemId,
      status: statusByItem.get(itemId)?.status ?? 'OPEN',
      clauseTypes: [...e.clauseTypes],
      docIds: e.docIds,
      evidenceCount: e.count,
    }));

    // 2. Route to relevant items (LLM, keyword fallback).
    let selectedIds: string[] = [];
    if (query && !isMock()) {
      try {
        selectedIds = await routeLibraryItems({
          query,
          items: items.map((i) => ({ id: i.id, title: i.title, status: i.status, clauseTypes: i.clauseTypes })),
        });
      } catch {
        selectedIds = [];
      }
    }
    if (selectedIds.length === 0) selectedIds = keywordRoute(query, items);
    const selectedSet = new Set(selectedIds);
    const selected = items.filter((i) => selectedSet.has(i.id));
    if (selected.length === 0) return [];

    // 3. Rank the docs behind the selected items by relevance using a Haiku
    // RERANKER (Claude-native — no embeddings). Haiku reads the candidate clauses
    // in the ToC slice and orders them by relevance to the question, so MAX_DOCS
    // returns the most relevant docs when an item spans many documents.
    const fallbackDocIds = () =>
      [...new Set(selected.flatMap((i) => [...i.docIds]))].slice(0, MAX_DOCS);

    let docIds: string[];
    const selectedItemIds = selected.map((i) => i.id);
    const sliceProvs = (
      await prisma.libraryNode.findMany({
        where: { projectId: scope.projectId, type: 'PROVISION', itemId: { in: selectedItemIds } },
        select: { id: true, sourceDocumentId: true, clauseType: true, title: true, content: true, riskLevel: true },
      })
    ).filter((p) => inScope(p.sourceDocumentId) && p.sourceDocumentId);

    if (query && sliceProvs.length && !isMock()) {
      // Cap the candidate set the reranker reads (risk-first) so the call stays bounded.
      const candidates = [...sliceProvs]
        .sort((a, b) => (RISK_RANK[b.riskLevel ?? ''] ?? 0) - (RISK_RANK[a.riskLevel ?? ''] ?? 0))
        .slice(0, RERANK_CANDIDATES);
      let ranked: string[] = [];
      try {
        ranked = await rerankProvisions({
          query,
          candidates: candidates.map((c) => ({ id: c.id, clauseType: c.clauseType ?? '', title: c.title, text: c.content ?? '' })),
        });
      } catch {
        ranked = [];
      }
      const docByProv = new Map(sliceProvs.map((p) => [p.id, p.sourceDocumentId as string]));
      const seen = new Set<string>();
      docIds = [];
      for (const id of ranked) {
        const d = docByProv.get(id);
        if (d && !seen.has(d)) {
          seen.add(d);
          docIds.push(d);
        }
        if (docIds.length >= MAX_DOCS) break;
      }
      if (docIds.length === 0) docIds = fallbackDocIds();
    } else {
      docIds = fallbackDocIds();
    }

    const docs = docIds.length
      ? await prisma.document.findMany({
          where: { id: { in: docIds }, extractionS3Key: { not: null } },
          select: { id: true, name: true, extractionS3Key: true },
        })
      : [];

    const factSheets = (
      await Promise.all(
        docs.map(async (d) => {
          if (!d.extractionS3Key) return null;
          try {
            return {
              documentId: d.id,
              documentName: d.name,
              factSheetMarkdown: await s3Service.getObjectText(d.extractionS3Key),
            } as DocRef;
          } catch {
            return null;
          }
        })
      )
    ).filter((r): r is DocRef => r !== null);

    // 4. Prepend the coverage summary (surfaces OPEN gaps for the answer).
    return [
      { documentId: COVERAGE_DOC_ID, documentName: 'Diligence coverage', factSheetMarkdown: renderCoverage(selected) },
      ...factSheets,
    ];
  },
};
