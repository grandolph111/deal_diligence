import { Request, Response } from 'express';
import { searchService } from './search.service';
import { searchQuerySchema } from './search.validators';
import { auditService, AuditAction, AuditResourceType } from '../audit';

export const searchController = {
  /**
   * POST /projects/:id/search
   * Search documents in a project
   */
  search: async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const userId = req.user!.id;

    // Validate query parameters (from body for POST, or query for GET)
    const input = searchQuerySchema.parse({
      ...req.body,
      ...req.query,
    });

    const results = await searchService.search(projectId, userId, input);

    // Log search query to audit
    await auditService.logSearch(req, projectId, {
      query: input.query,
      searchType: input.searchType as 'keyword' | 'semantic' | 'hybrid',
      resultCount: results.pagination.total,
      filters: {
        folderIds: input.folderIds,
        documentTypes: input.documentTypes,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
    });

    res.json(results);
  },

  /**
   * POST /projects/:id/search/similar/:documentId
   * Find documents similar to a given document
   */
  findSimilar: async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const userId = req.user!.id;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const results = await searchService.findSimilar(
      projectId,
      userId,
      documentId,
      page,
      Math.min(limit, 100)
    );

    // Log similarity search to audit
    await auditService.createLog({
      projectId,
      userId,
      action: AuditAction.SEARCH_SEMANTIC,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: documentId,
      metadata: {
        resultsCount: results.pagination.total,
      },
    });

    res.json(results);
  },
};
