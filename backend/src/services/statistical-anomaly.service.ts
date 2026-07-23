/**
 * Statistical anomaly detection (Phase C scaling).
 *
 * Replaces the "send every fact sheet to Sonnet" anomaly pass, which dies at
 * thousands of documents. Peer-group outliers are a *statistics* problem, not a
 * reasoning one — they're computed deterministically in SQL/code over the
 * already-extracted structured fields (library provisions + document scalars),
 * so cost/latency is independent of corpus size and there's no context ceiling.
 *
 * Three families of outlier, each requiring ≥3 peers (same contract as before):
 *   1. Risk-level outlier per clause type — a clause that's unusually risky here
 *      vs. the peer norm ("HIGH indemnity, but MEDIUM in 11 of 13 documents").
 *   2. Governing-law / jurisdiction minority ("12 of 13 Delaware; this one NY").
 *   3. Overall risk-score outlier (≥2 SD from the deal mean).
 *
 * Output matches the existing Document.anomalyFlags shape so the graph, lint, and
 * deal brief consume it unchanged.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

interface AnomalyFlag {
  clauseType: string;
  thisValue: string;
  peerValue: string;
  peerSize: number;
  reason: string;
}

const RISK_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const norm = (s: string): string => s.trim().toLowerCase();

export const statisticalAnomalyService = {
  /** Recompute anomaly flags for a project deterministically. Returns count flagged. */
  async detect(projectId: string): Promise<{ documentsFlagged: number }> {
    const [provisions, docs] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'PROVISION', clauseType: { not: null } },
        select: { clauseType: true, riskLevel: true, sourceDocumentId: true },
      }),
      prisma.document.findMany({
        where: { projectId, processingStatus: 'COMPLETE' },
        select: { id: true, governingLaw: true, riskScore: true },
      }),
    ]);

    const flagsByDoc = new Map<string, AnomalyFlag[]>();
    const add = (docId: string, f: AnomalyFlag) => {
      const arr = flagsByDoc.get(docId) ?? [];
      arr.push(f);
      flagsByDoc.set(docId, arr);
    };

    // ---- 1. Risk-level outlier per clause type ----
    // Per (clauseType, doc) take the max risk level, then compare across docs.
    const byClause = new Map<string, Map<string, number>>(); // clauseType → docId → maxRiskRank
    for (const p of provisions) {
      if (!p.sourceDocumentId || !p.clauseType) continue;
      const ct = p.clauseType.toUpperCase();
      const rank = RISK_RANK[(p.riskLevel ?? 'LOW').toUpperCase()] ?? 0;
      const docMap = byClause.get(ct) ?? new Map();
      docMap.set(p.sourceDocumentId, Math.max(docMap.get(p.sourceDocumentId) ?? 0, rank));
      byClause.set(ct, docMap);
    }
    for (const [clauseType, docMap] of byClause) {
      if (docMap.size < 3) continue;
      const ranks = [...docMap.values()];
      // modal (most common) rank
      const counts = ranks.reduce((m: Record<number, number>, r) => ((m[r] = (m[r] ?? 0) + 1), m), {});
      const modeRank = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
      const modeCount = counts[modeRank];
      const label = (r: number) => Object.keys(RISK_RANK).find((k) => RISK_RANK[k] === r) ?? '?';
      for (const [docId, rank] of docMap) {
        // Flag docs whose clause is riskier than the peer norm (escalation outlier).
        if (rank > modeRank && rank === RISK_RANK.HIGH) {
          add(docId, {
            clauseType,
            thisValue: label(rank),
            peerValue: `${label(modeRank)} (${modeCount}/${docMap.size})`,
            peerSize: docMap.size,
            reason: `${clauseType} is ${label(rank)} here but ${label(modeRank)} in ${modeCount} of ${docMap.size} documents.`,
          });
        }
      }
    }

    // ---- 2. Governing-law / jurisdiction minority ----
    const withLaw = docs.filter((d) => d.governingLaw && d.governingLaw.trim());
    if (withLaw.length >= 3) {
      const freq = new Map<string, string[]>(); // normalized law → docIds
      for (const d of withLaw) {
        const k = norm(d.governingLaw!);
        freq.set(k, [...(freq.get(k) ?? []), d.id]);
      }
      const sorted = [...freq.entries()].sort((a, b) => b[1].length - a[1].length);
      const [majKey, majDocs] = sorted[0];
      const majLabel = withLaw.find((d) => norm(d.governingLaw!) === majKey)!.governingLaw!;
      // Only flag if there's a clear majority (> half) and a minority.
      if (majDocs.length > withLaw.length / 2 && sorted.length > 1) {
        for (const [key, ids] of sorted.slice(1)) {
          const label = withLaw.find((d) => norm(d.governingLaw!) === key)!.governingLaw!;
          for (const id of ids) {
            add(id, {
              clauseType: 'GOVERNING_LAW',
              thisValue: label,
              peerValue: `${majLabel} (${majDocs.length}/${withLaw.length})`,
              peerSize: withLaw.length,
              reason: `Governed by ${label}; ${majDocs.length} of ${withLaw.length} documents use ${majLabel}.`,
            });
          }
        }
      }
    }

    // ---- 3. Overall risk-score outlier (≥2 SD) ----
    const scored = docs.filter((d) => d.riskScore != null) as Array<{ id: string; riskScore: number }>;
    if (scored.length >= 3) {
      const mean = scored.reduce((s, d) => s + d.riskScore, 0) / scored.length;
      const variance = scored.reduce((s, d) => s + (d.riskScore - mean) ** 2, 0) / scored.length;
      const sd = Math.sqrt(variance);
      if (sd > 0) {
        for (const d of scored) {
          if (Math.abs(d.riskScore - mean) >= 2 * sd) {
            add(d.id, {
              clauseType: 'OVERALL_RISK',
              thisValue: `${d.riskScore}/10`,
              peerValue: `mean ${mean.toFixed(1)}/10`,
              peerSize: scored.length,
              reason: `Overall risk ${d.riskScore}/10 is ${d.riskScore > mean ? 'well above' : 'well below'} the deal mean of ${mean.toFixed(1)} (≥2 SD).`,
            });
          }
        }
      }
    }

    // ---- persist: reset all, then write flagged ----
    await prisma.document.updateMany({ where: { projectId }, data: { anomalyFlags: Prisma.JsonNull } });
    for (const [documentId, flags] of flagsByDoc) {
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: { anomalyFlags: flags as unknown as Prisma.InputJsonValue },
        });
      } catch {
        // doc may have been deleted mid-run — skip
      }
    }

    return { documentsFlagged: flagsByDoc.size };
  },
};
