/**
 * Retrieval interface.
 *
 * `defaultRetriever` is what callers should use. It navigates the risk categories
 * risk categories (`libraryTocRetriever`) and falls back to whole fact sheets only
 * when a project has no library evidence to navigate.
 *
 * The unit matters more than the ranking. A question about change-of-control
 * needs six provisions from four contracts, not four entire fact sheets — and
 * stuffing whole documents has a hard ceiling: a few thousand documents is
 * millions of tokens per turn, which no context window absorbs. `stuffRetriever`
 * remains correct for an explicit document pin, where the caller has already
 * chosen the scope, and as the fallback below; it is no longer the default.
 */

import { prisma } from '../../config/database';
import { s3Service } from '../../services/s3.service';
import { libraryTocRetriever } from './libraryTocRetriever';

export interface DocRef {
  documentId: string;
  documentName: string;
  factSheetMarkdown: string;
}

export interface RetrievalScope {
  projectId: string;
  documentIds?: string[]; // explicit allowlist; used by task attachments
  folderIds?: string[]; // folder scope from caller's restrictedFolders
}

export interface Retriever {
  search(query: string | null, scope: RetrievalScope): Promise<DocRef[]>;
}

/**
 * Hard cap on documents stuffed in one turn.
 *
 * Chosen to match libraryTocRetriever's own MAX_DOCS so the fallback path
 * cannot blow a context window the primary path respects. Truncation is logged
 * rather than silent: an answer drawn from 40 of 900 documents that presents
 * itself as complete is worse than one that admits its scope.
 */
const STUFF_MAX_DOCS = Math.max(
  1,
  parseInt(process.env.RETRIEVAL_STUFF_MAX_DOCS || '12', 10)
);

export const stuffRetriever: Retriever = {
  async search(_query, scope) {
    const docs = await prisma.document.findMany({
      where: {
        projectId: scope.projectId,
        processingStatus: 'COMPLETE',
        extractionS3Key: { not: null },
        ...(scope.documentIds ? { id: { in: scope.documentIds } } : {}),
        ...(scope.folderIds && scope.folderIds.length > 0
          ? { folderId: { in: scope.folderIds } }
          : {}),
      },
      // Deterministic and meaningful: without an order the capped slice is
      // whatever the planner returns, so which 12 documents answer a question
      // is unspecified and can change between identical queries. Riskiest first
      // is the right bias when only some of the deal fits.
      orderBy: [{ riskScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        extractionS3Key: true,
      },
    });

    // An explicit pin is the caller's own scope choice, so honour it in full;
    // an unscoped sweep is capped.
    const explicitPin = !!scope.documentIds && scope.documentIds.length > 0;
    const selected = explicitPin ? docs : docs.slice(0, STUFF_MAX_DOCS);
    if (!explicitPin && docs.length > selected.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[retrieval] stuffRetriever truncated ${docs.length} in-scope documents to ` +
          `${selected.length}. The answer will not cover the rest — enable the ` +
          `knowledge library so retrieval can navigate the risk categories instead.`
      );
    }

    const results = await Promise.all(
      selected.map(async (d) => {
        if (!d.extractionS3Key) return null;
        try {
          const markdown = await s3Service.getObjectText(d.extractionS3Key);
          return {
            documentId: d.id,
            documentName: d.name,
            factSheetMarkdown: markdown,
          };
        } catch {
          return null;
        }
      })
    );

    return results.filter((r): r is DocRef => r !== null);
  },
};

/**
 * The retriever every caller should use.
 *
 * Prefers risk-category navigation and degrades to bounded stuffing when a project
 * has nothing filed in the library — which is the case for any deal ingested
 * before the library existed, and for the window between upload and the first
 * reconciliation pass. Choosing on actual data rather than on a config flag
 * means a project whose library is empty still answers questions, and one whose
 * library is populated automatically gets the retrieval that scales.
 */
export const defaultRetriever: Retriever = {
  async search(query, scope) {
    const viaLibrary = await libraryTocRetriever.search(query, scope);
    if (viaLibrary.length > 0) return viaLibrary;
    return stuffRetriever.search(query, scope);
  },
};

export { libraryTocRetriever };
