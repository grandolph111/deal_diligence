import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { documentsService } from '../documents/documents.service';
import {
  SearchQueryInput,
  SearchResponse,
  SearchResult,
  SearchSnippet,
  SearchTypeValue,
} from './search.validators';

export const searchService = {
  /**
   * Get accessible folder IDs for a user
   * Returns null if user has full access (OWNER/ADMIN or no restrictions)
   */
  async getAccessibleFolderIds(
    projectId: string,
    userId: string
  ): Promise<string[] | null> {
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Not a member of this project');
    }

    // OWNER and ADMIN have full access
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
      return null;
    }

    const permissions = membership.permissions as Record<string, unknown> | null;
    const restrictedFolders = permissions?.restrictedFolders as string[] | undefined;

    // If no folder restrictions, user has access to all folders
    if (!restrictedFolders || restrictedFolders.length === 0) {
      return null;
    }

    // Get all accessible folder IDs including descendants
    return documentsService.getAccessibleFolderIds(projectId, restrictedFolders);
  },

  /**
   * Search documents using PostgreSQL (keyword). Semantic search is deferred
   * until an embedding provider is added behind the retrieval interface.
   */
  async searchViaPostgreSQL(
    projectId: string,
    userId: string,
    query: SearchQueryInput
  ): Promise<SearchResponse> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    // Get accessible folders for the user
    const accessibleFolderIds = await this.getAccessibleFolderIds(projectId, userId);

    // Build where clause
    const where: {
      projectId: string;
      folderId?: { in: string[] } | string | null;
      documentType?: { in: string[] };
      createdAt?: { gte?: Date; lte?: Date };
      OR?: Array<{ name: { contains: string; mode: 'insensitive' } }>;
    } = {
      projectId,
    };

    // Apply folder filter
    if (query.folderIds && query.folderIds.length > 0) {
      if (accessibleFolderIds) {
        // Intersect with accessible folders
        const allowed = query.folderIds.filter((id) => accessibleFolderIds.includes(id));
        if (allowed.length === 0) {
          return {
            query: query.query,
            searchType: query.searchType as SearchTypeValue,
            results: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          };
        }
        where.folderId = { in: allowed };
      } else {
        where.folderId = { in: query.folderIds };
      }
    } else if (accessibleFolderIds) {
      where.folderId = { in: accessibleFolderIds };
    }

    // Apply document type filter
    if (query.documentTypes && query.documentTypes.length > 0) {
      where.documentType = { in: query.documentTypes };
    }

    // Apply date range filter
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    // Full-text search on document name (basic PostgreSQL search)
    // Note: This is a simple LIKE search; a production system would use
    // PostgreSQL full-text search (tsvector/tsquery) for better results
    where.OR = [{ name: { contains: query.query, mode: 'insensitive' } }];

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          folder: {
            select: { id: true, name: true, isViewOnly: true },
          },
          uploadedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    // Convert to search results (matching frontend SearchResult type)
    const results: SearchResult[] = documents.map((doc, index) => ({
      document: {
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        processingStatus: doc.processingStatus,
        documentType: doc.documentType,
        riskLevel: doc.riskLevel,
        folderId: doc.folderId,
        folder: doc.folder
          ? {
              id: doc.folder.id,
              name: doc.folder.name,
            }
          : undefined,
        uploadedBy: doc.uploadedBy
          ? {
              id: doc.uploadedBy.id,
              name: doc.uploadedBy.name,
              email: doc.uploadedBy.email,
            }
          : null,
        createdAt: doc.createdAt,
      },
      score: 1 - index * 0.01, // Simple score based on position
      snippets: this.generateSimpleSnippets(doc.name, query.query),
      isRestricted: false,
    }));

    return {
      query: query.query,
      searchType: 'keyword' as SearchTypeValue,
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Generate simple snippets for PostgreSQL fallback
   */
  generateSimpleSnippets(filename: string, query: string): SearchSnippet[] {
    const lowerFilename = filename.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerFilename.indexOf(lowerQuery);

    if (index === -1) {
      return [];
    }

    return [
      {
        text: filename,
        highlights: [{ start: index, end: index + query.length }],
      },
    ];
  },

  /**
   * Primary search entry point. Keyword-only for MVP.
   */
  async search(
    projectId: string,
    userId: string,
    query: SearchQueryInput
  ): Promise<SearchResponse> {
    return this.searchViaPostgreSQL(projectId, userId, query);
  },

  /**
   * Find similar documents. Returns empty until an embedding provider is wired in.
   */
  async findSimilar(
    projectId: string,
    userId: string,
    documentId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<SearchResponse> {
    const hasAccess = await documentsService.userHasDocumentAccess(
      documentId,
      userId,
      projectId
    );
    if (!hasAccess) throw ApiError.notFound('Document not found');
    return {
      query: `similar to ${documentId}`,
      searchType: 'semantic' as SearchTypeValue,
      results: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  },
};
