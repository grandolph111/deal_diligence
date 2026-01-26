import { prisma } from '../../config/database';
import { config } from '../../config';
import { ApiError } from '../../utils/ApiError';
import { foldersService } from '../folders/folders.service';
import { documentsService } from '../documents/documents.service';
import {
  SearchQueryInput,
  SearchResponse,
  SearchResult,
  SearchSnippet,
  SearchTypeValue,
} from './search.validators';

/**
 * Python microservice search response format
 */
interface PythonSearchResponse {
  query: string;
  results: Array<{
    document_id: string;
    berrydb_id: string | null;
    filename: string;
    folder_id: string | null;
    score: number;
    snippets: Array<{
      text: string;
      page_number: number | null;
      highlights: Array<[number, number]>;
    }>;
    document_type: string | null;
    risk_level: string | null;
  }>;
  total_count: number;
  page: number;
  page_size: number;
  search_type: string;
}

export const searchService = {
  /**
   * Check if Python microservice is available
   */
  async isPythonServiceAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${config.pythonService.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

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
   * Search documents via Python microservice (BerryDB)
   */
  async searchViaBerryDB(
    projectId: string,
    userId: string,
    query: SearchQueryInput
  ): Promise<SearchResponse> {
    // Get accessible folders for the user
    const accessibleFolderIds = await this.getAccessibleFolderIds(projectId, userId);

    // Build folder filter
    let folderIds: string[] | undefined;
    if (query.folderIds && query.folderIds.length > 0) {
      // If user has restrictions, filter to only accessible folders
      if (accessibleFolderIds) {
        folderIds = query.folderIds.filter((id) => accessibleFolderIds.includes(id));
        if (folderIds.length === 0) {
          // User requested folders they don't have access to
          return {
            query: query.query,
            searchType: query.searchType as SearchTypeValue,
            results: [],
            pagination: {
              page: query.page,
              limit: query.limit,
              total: 0,
              totalPages: 0,
            },
          };
        }
      } else {
        folderIds = query.folderIds;
      }
    } else if (accessibleFolderIds) {
      // No specific folders requested, use all accessible folders
      folderIds = accessibleFolderIds;
    }

    // Call Python microservice
    const pythonResponse = await fetch(`${config.pythonService.url}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query.query,
        project_id: projectId,
        search_type: query.searchType,
        folder_ids: folderIds,
        document_types: query.documentTypes,
        date_from: query.dateFrom,
        date_to: query.dateTo,
        page: query.page,
        page_size: query.limit,
      }),
    });

    if (!pythonResponse.ok) {
      const error = await pythonResponse.text();
      throw ApiError.internal(`Search service error: ${error}`);
    }

    const data = (await pythonResponse.json()) as PythonSearchResponse;

    // Enrich results with document metadata from PostgreSQL
    const enrichedResults = await this.enrichSearchResults(
      data.results,
      projectId,
      userId,
      accessibleFolderIds
    );

    return {
      query: data.query,
      searchType: data.search_type as SearchTypeValue,
      results: enrichedResults,
      pagination: {
        page: data.page,
        limit: data.page_size,
        total: data.total_count,
        totalPages: Math.ceil(data.total_count / data.page_size),
      },
    };
  },

  /**
   * Search documents using PostgreSQL fallback (full-text search)
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
   * Enrich search results with PostgreSQL document metadata
   */
  async enrichSearchResults(
    results: PythonSearchResponse['results'],
    projectId: string,
    userId: string,
    accessibleFolderIds: string[] | null
  ): Promise<SearchResult[]> {
    if (results.length === 0) {
      return [];
    }

    // Get document IDs from results
    const documentIds = results.map((r) => r.document_id);

    // Fetch documents with metadata
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        projectId,
      },
      include: {
        folder: {
          select: { id: true, name: true, isViewOnly: true },
        },
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create lookup map
    const docMap = new Map(documents.map((d) => [d.id, d]));

    // Map results, marking restricted documents (matching frontend SearchResult type)
    return results.map((result) => {
      const doc = docMap.get(result.document_id);

      // Check if document is restricted
      let isRestricted = false;
      if (accessibleFolderIds && doc?.folderId) {
        isRestricted = !accessibleFolderIds.includes(doc.folderId);
      }

      const snippets: SearchSnippet[] = result.snippets.map((s) => ({
        text: s.text,
        pageNumber: s.page_number ?? undefined,
        highlights: s.highlights.map((h) => ({ start: h[0], end: h[1] })),
      }));

      return {
        document: {
          id: result.document_id,
          name: doc?.name ?? result.filename,
          mimeType: doc?.mimeType ?? 'application/pdf',
          sizeBytes: doc?.sizeBytes ?? 0,
          processingStatus: doc?.processingStatus ?? null,
          documentType: doc?.documentType ?? result.document_type,
          riskLevel: doc?.riskLevel ?? result.risk_level,
          folderId: doc?.folderId ?? result.folder_id,
          folder: doc?.folder
            ? {
                id: doc.folder.id,
                name: doc.folder.name,
              }
            : undefined,
          uploadedBy: doc?.uploadedBy
            ? {
                id: doc.uploadedBy.id,
                name: doc.uploadedBy.name,
                email: doc.uploadedBy.email,
              }
            : null,
          createdAt: doc?.createdAt ?? new Date(),
        },
        score: result.score,
        snippets: isRestricted ? [] : snippets, // Hide snippets for restricted docs
        isRestricted,
      };
    });
  },

  /**
   * Main search method - uses Python microservice if available, falls back to PostgreSQL
   */
  async search(
    projectId: string,
    userId: string,
    query: SearchQueryInput
  ): Promise<SearchResponse> {
    // Check if Python microservice is available
    const isPythonAvailable = await this.isPythonServiceAvailable();

    if (isPythonAvailable) {
      try {
        return await this.searchViaBerryDB(projectId, userId, query);
      } catch (error) {
        // Log error and fall back to PostgreSQL
        // eslint-disable-next-line no-console
        console.error('BerryDB search failed, falling back to PostgreSQL:', error);
      }
    }

    // Fall back to PostgreSQL search
    return this.searchViaPostgreSQL(projectId, userId, query);
  },

  /**
   * Find similar documents (semantic search only)
   */
  async findSimilar(
    projectId: string,
    userId: string,
    documentId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<SearchResponse> {
    // Verify document exists and user has access
    const hasAccess = await documentsService.userHasDocumentAccess(
      documentId,
      userId,
      projectId
    );

    if (!hasAccess) {
      throw ApiError.notFound('Document not found');
    }

    // Get accessible folders
    const accessibleFolderIds = await this.getAccessibleFolderIds(projectId, userId);

    // Check if Python microservice is available
    const isPythonAvailable = await this.isPythonServiceAvailable();

    if (!isPythonAvailable) {
      // Return empty results if no semantic search available
      return {
        query: `similar to ${documentId}`,
        searchType: 'semantic',
        results: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    try {
      const pythonResponse = await fetch(
        `${config.pythonService.url}/search/similar/${documentId}?project_id=${projectId}&page=${page}&page_size=${limit}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!pythonResponse.ok) {
        throw new Error('Similarity search failed');
      }

      const data = (await pythonResponse.json()) as PythonSearchResponse;

      // Enrich and filter results
      const enrichedResults = await this.enrichSearchResults(
        data.results,
        projectId,
        userId,
        accessibleFolderIds
      );

      return {
        query: data.query,
        searchType: 'semantic',
        results: enrichedResults,
        pagination: {
          page: data.page,
          limit: data.page_size,
          total: data.total_count,
          totalPages: Math.ceil(data.total_count / data.page_size),
        },
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Similarity search failed:', error);

      return {
        query: `similar to ${documentId}`,
        searchType: 'semantic',
        results: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }
  },
};
