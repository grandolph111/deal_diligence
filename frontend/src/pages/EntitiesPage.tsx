import { useState, useCallback, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { membersService, apiClient } from '../api';
import { useAuth } from '../auth';
import { useMasterEntities } from '../features/vdr/hooks/useMasterEntities';
import { MasterEntityList } from '../features/vdr/components/MasterEntityList';
import { MasterEntityDetailModal } from '../features/vdr/components/MasterEntityDetailModal';
import { EntityMergeModal } from '../features/vdr/components/EntityMergeModal';
import type { ProjectMember, MasterEntityWithCount, DeduplicationStats } from '../types/api';
import '../features/vdr/vdr.css';
import '../features/vdr/entities.css';

/**
 * Entity Management Page for the Knowledge Graph
 */
export function EntitiesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Member state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Master entities hook
  const {
    entities,
    loading,
    error,
    pagination,
    selectedEntity,
    detailLoading,
    detailError,
    duplicates,
    duplicatesLoading,
    entityTypeFilter,
    searchQuery,
    fetchEntities,
    fetchEntityDetail,
    clearSelectedEntity,
    fetchDuplicates,
    setEntityTypeFilter,
    setSearchQuery,
    updateEntity,
    deleteEntity,
    mergeEntities,
    splitEntity,
    runDeduplication,
  } = useMasterEntities({ projectId, autoFetch: false });

  // Merge modal state
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeEntity1, setMergeEntity1] = useState<MasterEntityWithCount | null>(null);
  const [mergeEntity2, setMergeEntity2] = useState<MasterEntityWithCount | null>(null);

  // Deduplication status
  const [deduplicationRunning, setDeduplicationRunning] = useState(false);
  const [deduplicationResult, setDeduplicationResult] = useState<DeduplicationStats | null>(null);

  // Get current user's membership info
  const currentUserMember = members.find((m) => m.user?.email === user?.email);
  const isAdmin =
    currentUserMember?.role === 'OWNER' || currentUserMember?.role === 'ADMIN';
  const canAccessVDR =
    isAdmin || currentUserMember?.permissions?.canAccessVDR !== false;

  // Fetch members
  useEffect(() => {
    if (authLoading || !apiClient.isReady() || !projectId) {
      return;
    }

    async function fetchMembers() {
      try {
        setMembersLoading(true);
        const membersData = await membersService.getMembers(projectId!);
        setMembers(membersData);
      } catch {
        // Silently handle
      } finally {
        setMembersLoading(false);
      }
    }

    fetchMembers();
  }, [projectId, authLoading]);

  // Fetch entities after members are loaded (to check permissions)
  useEffect(() => {
    if (!membersLoading && canAccessVDR && projectId) {
      fetchEntities(1, 20);
      fetchDuplicates();
    }
  }, [membersLoading, canAccessVDR, projectId, fetchEntities, fetchDuplicates]);

  // Handle entity click to open detail modal
  const handleEntityClick = useCallback(
    (entityId: string) => {
      fetchEntityDetail(entityId);
    },
    [fetchEntityDetail]
  );

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      fetchEntities(page, pagination.limit);
    },
    [fetchEntities, pagination.limit]
  );

  // Handle update entity
  const handleUpdateEntity = useCallback(
    async (data: { canonicalName?: string; aliases?: string[] }) => {
      if (!selectedEntity) return;
      await updateEntity(selectedEntity.id, data);
    },
    [selectedEntity, updateEntity]
  );

  // Handle delete entity
  const handleDeleteEntity = useCallback(async () => {
    if (!selectedEntity) return;
    await deleteEntity(selectedEntity.id);
  }, [selectedEntity, deleteEntity]);

  // Handle split entity
  const handleSplitEntity = useCallback(
    async (docEntityIds: string[], newName: string) => {
      if (!selectedEntity) return;
      await splitEntity(selectedEntity.id, docEntityIds, newName);
    },
    [selectedEntity, splitEntity]
  );

  // Handle open merge modal from duplicates
  const handleOpenMergeFromDuplicates = useCallback(
    (entity1Id: string, entity2Id: string) => {
      const e1 = entities.find((e) => e.id === entity1Id);
      const e2 = entities.find((e) => e.id === entity2Id);
      if (e1 && e2) {
        setMergeEntity1(e1);
        setMergeEntity2(e2);
        setMergeModalOpen(true);
      }
    },
    [entities]
  );

  // Handle merge entities
  const handleMergeEntities = useCallback(
    async (sourceIds: string[], targetId: string, canonicalName?: string) => {
      await mergeEntities(sourceIds, targetId, canonicalName);
      setMergeModalOpen(false);
      setMergeEntity1(null);
      setMergeEntity2(null);
      // Refresh duplicates after merge
      fetchDuplicates();
    },
    [mergeEntities, fetchDuplicates]
  );

  // Handle close merge modal
  const handleCloseMergeModal = useCallback(() => {
    setMergeModalOpen(false);
    setMergeEntity1(null);
    setMergeEntity2(null);
  }, []);

  // Handle run deduplication
  const handleRunDeduplication = useCallback(async () => {
    if (!confirm('Run automatic deduplication? This will link unprocessed document entities to existing or new master entities.')) {
      return;
    }

    setDeduplicationRunning(true);
    setDeduplicationResult(null);
    try {
      const stats = await runDeduplication(entityTypeFilter || undefined);
      setDeduplicationResult(stats);
      // Refresh duplicates after deduplication
      fetchDuplicates();
    } catch {
      // Error handling done in hook
    } finally {
      setDeduplicationRunning(false);
    }
  }, [runDeduplication, entityTypeFilter, fetchDuplicates]);

  // Handle document click from entity detail
  const handleDocumentClick = useCallback(
    (documentId: string) => {
      // Navigate to VDR with document open
      navigate(`/projects/${projectId}/vdr?document=${documentId}`);
    },
    [navigate, projectId]
  );

  // Handle related entity click
  const handleRelatedEntityClick = useCallback(
    (entityId: string) => {
      clearSelectedEntity();
      fetchEntityDetail(entityId);
    },
    [clearSelectedEntity, fetchEntityDetail]
  );

  // Loading state
  if (authLoading || membersLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  // Access denied
  if (!canAccessVDR) {
    return (
      <div className="entities-page">
        <div className="page-header">
          <Link to={`/projects/${projectId}`} className="back-link">
            <ArrowLeft size={16} />
            Back to Project
          </Link>
        </div>
        <div className="error-container">
          <h2>Access Denied</h2>
          <p>You do not have permission to access entity management.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="entities-page">
      {/* Page Header */}
      <div className="page-header">
        <Link to={`/projects/${projectId}`} className="back-link">
          <ArrowLeft size={16} />
          Back to Project
        </Link>

        <div className="page-header-title">
          <Users size={20} />
          <h1>Entity Management</h1>
        </div>

        <div className="page-header-actions">
          <Link to={`/projects/${projectId}/vdr`} className="button secondary">
            View Documents
          </Link>
        </div>
      </div>

      {/* Deduplication result notification */}
      {deduplicationResult && (
        <div className="deduplication-result">
          <p>
            <strong>Deduplication complete:</strong> Processed {deduplicationResult.processed} entities.
            Created {deduplicationResult.newMasterEntities} new master entities,
            linked {deduplicationResult.linkedToExisting} to existing,
            skipped {deduplicationResult.skipped}.
          </p>
          <button onClick={() => setDeduplicationResult(null)}>×</button>
        </div>
      )}

      {/* Main Content */}
      <div className="entities-content">
        <MasterEntityList
          entities={entities}
          loading={loading || deduplicationRunning}
          error={error}
          pagination={pagination}
          entityTypeFilter={entityTypeFilter}
          searchQuery={searchQuery}
          duplicates={duplicates}
          duplicatesLoading={duplicatesLoading}
          isAdmin={isAdmin}
          onEntityClick={handleEntityClick}
          onPageChange={handlePageChange}
          onEntityTypeFilterChange={setEntityTypeFilter}
          onSearchQueryChange={setSearchQuery}
          onRunDeduplication={handleRunDeduplication}
          onMergeClick={handleOpenMergeFromDuplicates}
        />
      </div>

      {/* Entity Detail Modal */}
      {selectedEntity && projectId && (
        <MasterEntityDetailModal
          entity={selectedEntity}
          loading={detailLoading}
          error={detailError}
          isAdmin={isAdmin}
          projectId={projectId}
          onClose={clearSelectedEntity}
          onUpdate={handleUpdateEntity}
          onDelete={handleDeleteEntity}
          onSplit={handleSplitEntity}
          onDocumentClick={handleDocumentClick}
          onRelatedEntityClick={handleRelatedEntityClick}
        />
      )}

      {/* Merge Modal */}
      <EntityMergeModal
        isOpen={mergeModalOpen}
        entity1={mergeEntity1}
        entity2={mergeEntity2}
        allEntities={entities}
        onClose={handleCloseMergeModal}
        onMerge={handleMergeEntities}
      />
    </div>
  );
}
