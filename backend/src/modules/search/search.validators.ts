import { z } from 'zod';

/**
 * Search type - keyword, semantic, or hybrid
 */
export const SearchType = {
  KEYWORD: 'keyword',
  SEMANTIC: 'semantic',
  HYBRID: 'hybrid',
} as const;

export type SearchTypeValue = (typeof SearchType)[keyof typeof SearchType];

/**
 * Document type filter values
 */
export const DocumentType = {
  CONTRACT: 'contract',
  FINANCIAL: 'financial',
  LEGAL: 'legal',
  CORPORATE: 'corporate',
  TECHNICAL: 'technical',
  OTHER: 'other',
} as const;

export type DocumentTypeValue = (typeof DocumentType)[keyof typeof DocumentType];

/**
 * Risk level filter values
 */
export const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export type RiskLevelValue = (typeof RiskLevel)[keyof typeof RiskLevel];

/**
 * Schema for search query request
 */
export const searchQuerySchema = z.object({
  query: z
    .string()
    .min(1, 'Search query is required')
    .max(500, 'Search query must be 500 characters or less')
    .trim(),
  searchType: z.enum(['keyword', 'semantic', 'hybrid']).default('hybrid'),
  folderIds: z
    .union([
      z.string().transform((val) => val.split(',').filter(Boolean)),
      z.array(z.string()),
    ])
    .optional(),
  documentTypes: z
    .union([
      z.string().transform((val) => val.split(',').filter(Boolean)),
      z.array(z.string()),
    ])
    .optional(),
  riskLevels: z
    .union([
      z.string().transform((val) => val.split(',').filter(Boolean)),
      z.array(z.string()),
    ])
    .optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

/**
 * Search snippet with highlighted text - matches frontend SearchSnippet type
 */
export interface SearchSnippet {
  text: string;
  pageNumber?: number;
  highlights: Array<{ start: number; end: number }>;
}

/**
 * Individual search result - matches frontend SearchResult type
 */
export interface SearchResult {
  document: {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    processingStatus: string | null;
    documentType: string | null;
    riskLevel: string | null;
    folderId: string | null;
    folder?: {
      id: string;
      name: string;
    };
    uploadedBy: {
      id: string;
      name: string | null;
      email: string;
    } | null;
    createdAt: Date | string;
  };
  score: number;
  snippets: SearchSnippet[];
  matchedEntities?: string[];
  isRestricted: boolean;
}

/**
 * Search response with pagination
 */
export interface SearchResponse {
  query: string;
  searchType: SearchTypeValue;
  results: SearchResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
