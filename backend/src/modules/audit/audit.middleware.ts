import { Request, Response, NextFunction } from 'express';
import { auditService } from './audit.service';
import { AuditAction, AuditResourceType } from './audit.validators';

/**
 * Safely extract a string parameter from req.params
 * Express params can be string | string[] depending on route config
 */
function getParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Middleware factory for auditing folder access
 * Logs folder view events when folders are accessed
 */
export function auditFolderAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json to log after successful response
    res.json = function (body: unknown) {
      // Only log on successful requests
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const projectId = getParam(req.params.id) || getParam(req.params.projectId);
        const folderId = getParam(req.params.folderId);

        if (projectId && folderId && req.user) {
          // Fire and forget - don't wait for audit log
          auditService
            .logFolderView(req, projectId, folderId)
            .catch((err) => {
              // Log but don't fail the request
              if (process.env.NODE_ENV === 'development') {
                console.error('Audit log error:', err);
              }
            });
        }
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware factory for auditing document access
 * Used for document detail views
 */
export function auditDocumentView() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const projectId = getParam(req.params.id) || getParam(req.params.projectId);
        const documentId = getParam(req.params.documentId);

        if (projectId && documentId && req.user) {
          auditService
            .logDocumentView(req, projectId, documentId, {
              fileName: (body as Record<string, unknown>)?.name as string,
            })
            .catch((err) => {
              if (process.env.NODE_ENV === 'development') {
                console.error('Audit log error:', err);
              }
            });
        }
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware factory for auditing document downloads
 * Used for download endpoints
 */
export function auditDocumentDownload() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // For downloads, we log when the response starts sending
    const originalSend = res.send.bind(res);
    const originalPipe = res.pipe?.bind(res);

    const logDownload = () => {
      const projectId = getParam(req.params.id) || getParam(req.params.projectId);
      const documentId = getParam(req.params.documentId);

      if (projectId && documentId && req.user) {
        auditService.logDocumentDownload(req, projectId, documentId).catch((err) => {
          if (process.env.NODE_ENV === 'development') {
            console.error('Audit log error:', err);
          }
        });
      }
    };

    res.send = function (...args) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        logDownload();
      }
      return originalSend(...args);
    };

    if (originalPipe) {
      res.pipe = function (...args) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logDownload();
        }
        return originalPipe(...args);
      } as typeof res.pipe;
    }

    next();
  };
}

/**
 * Middleware factory for auditing search queries
 * Should be applied to search endpoints
 */
export function auditSearch() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const projectId = getParam(req.params.id) || getParam(req.params.projectId);
        const query = req.body?.query || req.query?.q;
        const searchType = req.body?.searchType || req.query?.searchType || 'keyword';

        if (projectId && query && req.user) {
          const responseBody = body as Record<string, unknown>;
          auditService
            .logSearch(req, projectId, {
              query: String(query),
              filters: req.body?.filters || req.query,
              resultCount: Array.isArray(responseBody?.results)
                ? responseBody.results.length
                : responseBody?.total as number,
              searchType: searchType as 'keyword' | 'semantic' | 'hybrid',
            })
            .catch((err) => {
              if (process.env.NODE_ENV === 'development') {
                console.error('Audit log error:', err);
              }
            });
        }
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Generic audit middleware factory
 * Creates a middleware that logs the specified action for a resource
 */
export function createAuditMiddleware(
  action: string,
  resourceType: string,
  getResourceId: (req: Request) => string | undefined = (req) =>
    getParam(req.params.documentId) || getParam(req.params.folderId) || getParam(req.params.id),
  getMetadata?: (req: Request, res: Response, body: unknown) => Record<string, unknown> | undefined
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const projectId = getParam(req.params.id) || getParam(req.params.projectId);
        const resourceId = getResourceId(req);

        if (projectId && req.user) {
          const metadata = getMetadata ? getMetadata(req, res, body) : undefined;

          auditService
            .logFromRequest(
              req,
              projectId,
              action as typeof AuditAction[keyof typeof AuditAction],
              resourceType as typeof AuditResourceType[keyof typeof AuditResourceType],
              resourceId,
              metadata
            )
            .catch((err) => {
              if (process.env.NODE_ENV === 'development') {
                console.error('Audit log error:', err);
              }
            });
        }
      }

      return originalJson(body);
    };

    next();
  };
}
