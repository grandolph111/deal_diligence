/**
 * Retrieval interface.
 *
 * MVP: `StuffRetriever` returns all in-scope fact sheets; no semantic ranking.
 * When deal sizes exceed Claude's effective context for cost/latency, swap for
 * an embedding-based implementation (Voyage, Isaacus, OpenAI, or pgvector).
 * Callers depend only on `Retriever`.
 */

import { prisma } from '../../config/database';
import { s3Service } from '../../services/s3.service';

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
      select: {
        id: true,
        name: true,
        extractionS3Key: true,
      },
    });

    const results = await Promise.all(
      docs.map(async (d) => {
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
