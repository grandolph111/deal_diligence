import { apiClient } from '../client';
import type { EntityType } from '../../types/api';

/**
 * Relationship type
 */
export type RelationshipType =
  | 'PARTY_TO'
  | 'REFERENCES'
  | 'SUPERSEDES'
  | 'AMENDS'
  | 'RELATED_TO'
  | 'EMPLOYS'
  | 'SUBSIDIARY_OF'
  | 'OWNS';

/**
 * Entity summary for relationships
 */
export interface RelationshipEntity {
  id: string;
  canonicalName: string;
  entityType: EntityType;
}

/**
 * Entity relationship
 */
export interface EntityRelationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: RelationshipType;
  documentId: string | null;
  confidence: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  sourceEntity: RelationshipEntity;
  targetEntity: RelationshipEntity;
}

/**
 * List relationships response
 */
export interface RelationshipsListResponse {
  relationships: EntityRelationship[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * List relationships query params
 */
export interface ListRelationshipsParams {
  relationshipType?: RelationshipType;
  sourceEntityId?: string;
  targetEntityId?: string;
  documentId?: string;
  page?: number;
  limit?: number;
}

/**
 * Entity relationships response
 */
export interface EntityRelationshipsResponse {
  entity: RelationshipEntity;
  relationships: EntityRelationship[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Relationship statistics
 */
export interface RelationshipStats {
  totalRelationships: number;
  byType: Record<string, number>;
  totalEntities: number;
  entitiesWithRelationships: number;
  entitiesWithoutRelationships: number;
}

/**
 * Related document response
 */
export interface RelatedDocumentsResponse {
  document: {
    id: string;
    name: string;
  };
  relatedDocuments: Array<{
    document: {
      id: string;
      name: string;
      documentType: string | null;
      folderId: string | null;
      createdAt: string;
    };
    sharedEntityCount: number;
    sharedEntities: Array<{
      id: string;
      canonicalName: string;
      entityType: EntityType;
    }>;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Graph data for visualization
 */
export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    entityType: EntityType;
    documentCount: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relationshipType: RelationshipType;
    confidence: number;
  }>;
}

/**
 * Relationships API service for knowledge graph visualization
 */
export const relationshipsService = {
  /**
   * List all relationships in a project
   */
  async listRelationships(
    projectId: string,
    params?: ListRelationshipsParams
  ): Promise<RelationshipsListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.relationshipType) queryParams.set('relationshipType', params.relationshipType);
    if (params?.sourceEntityId) queryParams.set('sourceEntityId', params.sourceEntityId);
    if (params?.targetEntityId) queryParams.set('targetEntityId', params.targetEntityId);
    if (params?.documentId) queryParams.set('documentId', params.documentId);
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    const query = queryParams.toString();
    const url = `/projects/${projectId}/relationships${query ? `?${query}` : ''}`;

    return apiClient.get<RelationshipsListResponse>(url);
  },

  /**
   * Get relationship statistics for a project
   */
  async getRelationshipStats(projectId: string): Promise<RelationshipStats> {
    return apiClient.get<RelationshipStats>(`/projects/${projectId}/relationships/stats`);
  },

  /**
   * Get relationships for a specific entity
   */
  async getEntityRelationships(
    projectId: string,
    entityId: string,
    page = 1,
    limit = 20
  ): Promise<EntityRelationshipsResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set('page', String(page));
    queryParams.set('limit', String(limit));

    return apiClient.get<EntityRelationshipsResponse>(
      `/projects/${projectId}/entities/${entityId}/relationships?${queryParams.toString()}`
    );
  },

  /**
   * Get related documents for a document
   */
  async getRelatedDocuments(
    projectId: string,
    documentId: string,
    page = 1,
    limit = 10
  ): Promise<RelatedDocumentsResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set('page', String(page));
    queryParams.set('limit', String(limit));

    return apiClient.get<RelatedDocumentsResponse>(
      `/projects/${projectId}/documents/${documentId}/related?${queryParams.toString()}`
    );
  },

  /**
   * Build graph data from entities and relationships for visualization
   * Fetches all entities and relationships and transforms to graph format
   */
  async getGraphData(
    projectId: string,
    entityTypeFilter?: EntityType
  ): Promise<GraphData> {
    // Fetch master entities with document counts. Backend caps limit at 100
    // per request; if a deal has more, the graph renders the top 100 and users
    // can filter by entity type to narrow further. For the prototype scale
    // (dozens of docs per deal), one page is sufficient.
    const entitiesUrl = entityTypeFilter
      ? `/projects/${projectId}/master-entities?entityType=${entityTypeFilter}&limit=100`
      : `/projects/${projectId}/master-entities?limit=100`;

    const [entitiesResponse, relationshipsResponse] = await Promise.all([
      apiClient.get<{
        entities: Array<{
          id: string;
          canonicalName: string;
          entityType: EntityType;
          documentCount: number;
        }>;
      }>(entitiesUrl),
      this.listRelationships(projectId, { limit: 100 }),
    ]);

    // Build nodes from entities
    const nodes = entitiesResponse.entities.map((entity) => ({
      id: entity.id,
      label: entity.canonicalName,
      entityType: entity.entityType,
      documentCount: entity.documentCount || 0,
    }));

    // Build edges from relationships, filtering to only include edges where both nodes exist
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = relationshipsResponse.relationships
      .filter(
        (rel) => nodeIds.has(rel.sourceEntityId) && nodeIds.has(rel.targetEntityId)
      )
      .map((rel) => ({
        id: rel.id,
        source: rel.sourceEntityId,
        target: rel.targetEntityId,
        relationshipType: rel.relationshipType,
        confidence: rel.confidence,
      }));

    return { nodes, edges };
  },
};
