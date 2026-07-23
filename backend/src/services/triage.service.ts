/**
 * Ingestion triage (scale). Runs before extraction and decides, cheaply and
 * deterministically, how much a document is worth reading:
 *
 *   priority  P0 (critical) … P3 (bulk)  → model fidelity + queue order
 *   depth     FULL | STUB                → deep CUAD extraction vs. classify-only
 *   contentHash + duplicateOf            → de-duplication (don't re-read a copy)
 *
 * Signals are all available without a deep read: the folder's DD category, the
 * filename, mime type, size, and the document's content hash (S3 ETag). A later
 * classify pass can refine priority, but this gives every document a tier the
 * moment it lands — so the material tail is deep-extracted first and the bulk is
 * stubbed and deferred.
 */

import { prisma } from '../config/database';
import { s3Service } from './s3.service';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Depth = 'FULL' | 'STUB';

export interface TriageResult {
  priority: Priority;
  priorityReason: string;
  extractionDepth: Depth;
  contentHash: string | null;
  duplicateOfId: string | null;
}

/** Folder DD category → base criticality (higher = more diligence-critical). */
const CATEGORY_WEIGHT: Record<string, number> = {
  financial: 3, // 1.x Financial & Tax — QoE, statements, cap table
  legal: 3, // 2.x Corporate, Material Contracts, Litigation, Regulatory
  ip: 2,
  intellectual_property: 2,
  customers: 2,
  sales: 2,
  operations: 1,
  hr: 1,
  human_resources: 1,
  environmental: 1,
  other: 0,
};

// Filename signals. Deal instruments + core financials are the material tail.
const CRITICAL_RX =
  /\b(spa|apa|stock purchase|asset purchase|merger agreement|purchase agreement|cap[\s_-]?table|quality of earnings|qoe|audited|financial statement)\b/i;
const MATERIAL_RX =
  /\b(master agreement|msa|material|license|indemnif|guarant|credit agreement|shareholders? agreement|employment agreement|ip assignment|litigation|settlement)\b/i;
const BULK_RX =
  /\b(invoice|receipt|packing|correspondence|memo|draft|copy of|duplicate|scan\d*|img_|photo|screenshot)\b/i;

const scoreToPriority = (score: number): Priority =>
  score >= 4 ? 'P0' : score >= 3 ? 'P1' : score >= 1 ? 'P2' : 'P3';

export const triageService = {
  /**
   * Triage a just-confirmed document. Pure of side effects — returns the tier;
   * the caller persists it. Reads the content hash from S3 for de-dup.
   */
  async triage(documentId: string): Promise<TriageResult> {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        projectId: true,
        name: true,
        s3Key: true,
        folder: { select: { name: true, categoryType: true } },
      },
    });
    if (!doc) throw new Error(`Triage: document not found ${documentId}`);

    // --- de-duplication ---
    const contentHash = await s3Service.getObjectETag(doc.s3Key).catch(() => null);
    let duplicateOfId: string | null = null;
    if (contentHash) {
      const canonical = await prisma.document.findFirst({
        where: {
          projectId: doc.projectId,
          contentHash,
          id: { not: documentId },
          extractionDepth: 'FULL',
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      duplicateOfId = canonical?.id ?? null;
    }
    if (duplicateOfId) {
      return {
        priority: 'P3',
        priorityReason: 'Exact duplicate of an already-extracted document; extraction reused.',
        extractionDepth: 'STUB',
        contentHash,
        duplicateOfId,
      };
    }

    // --- priority score ---
    const category = (doc.folder?.categoryType ?? '').toLowerCase();
    const folderName = (doc.folder?.name ?? '').toLowerCase();
    let score = CATEGORY_WEIGHT[category] ?? 1;
    const reasons: string[] = [];
    if (category) reasons.push(`folder ${category} (w${CATEGORY_WEIGHT[category] ?? 1})`);
    // "Material Contracts" subfolder is high value even within legal.
    if (/material|contract/.test(folderName)) {
      score += 1;
      reasons.push('material-contracts folder');
    }

    // Normalize separators to spaces so \b signals fire on "Invoice_4471",
    // "MSA-final-v2.pdf", etc. (underscores/dots are word chars and break \b).
    const filename = doc.name.replace(/[^a-zA-Z0-9]+/g, ' ');
    if (CRITICAL_RX.test(filename)) {
      score += 2;
      reasons.push('critical filename signal');
    } else if (MATERIAL_RX.test(filename)) {
      score += 1;
      reasons.push('material filename signal');
    }
    if (BULK_RX.test(filename)) {
      score -= 2;
      reasons.push('bulk filename signal');
    }

    const priority = scoreToPriority(score);
    const extractionDepth: Depth = priority === 'P3' ? 'STUB' : 'FULL';

    return {
      priority,
      priorityReason: `${reasons.join(', ') || 'default'} → score ${score}`,
      extractionDepth,
      contentHash,
      duplicateOfId: null,
    };
  },
};
