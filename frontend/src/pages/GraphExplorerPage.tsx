import { useState, useCallback, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, GitBranch, Users, FolderOpen, BarChart2 } from 'lucide-react';
import { membersService, apiClient } from '../api';
import { useAuth } from '../auth';
import { useKnowledgeGraph } from '../features/vdr/hooks/useKnowledgeGraph';
import { GraphExplorer } from '../features/vdr/components/GraphExplorer';
import { NodeDetailPanel } from '../features/vdr/components/NodeDetailPanel';
import type { ProjectMember } from '../types/api';
import '../features/vdr/vdr.css';
import '../features/vdr/graph.css';

/**
 * Knowledge Graph Explorer Page
 * Visual exploration of entities and their relationships
 */
export function GraphExplorerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Member state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Knowledge graph hook
  const {
    graphData,
    stats,
    loading,
    error,
    entityTypeFilter,
    selectedNodeId,
    setEntityTypeFilter,
    setSelectedNodeId,
    refreshGraph,
  } = useKnowledgeGraph({ projectId: projectId || '' });

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

  // Handle node click
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, [setSelectedNodeId]);

  // Handle close detail panel
  const handleCloseDetailPanel = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  // Handle entity click from detail panel (navigate to same entity)
  const handleEntityClickFromPanel = useCallback((entityId: string) => {
    setSelectedNodeId(entityId);
  }, [setSelectedNodeId]);

  // Handle document click from detail panel
  const handleDocumentClick = useCallback(
    (documentId: string) => {
      navigate(`/projects/${projectId}/vdr?document=${documentId}`);
    },
    [navigate, projectId]
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
      <div className="graph-explorer-page">
        <div className="page-header">
          <Link to={`/projects/${projectId}`} className="back-link">
            <ArrowLeft size={16} />
            Back to Project
          </Link>
        </div>
        <div className="error-container">
          <h2>Access Denied</h2>
          <p>You do not have permission to access the knowledge graph.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-explorer-page">
      {/* Page Header */}
      <div className="page-header">
        <Link to={`/projects/${projectId}`} className="back-link">
          <ArrowLeft size={16} />
          Back to Project
        </Link>

        <div className="page-header-title">
          <GitBranch size={20} />
          <h1>Knowledge Graph</h1>
        </div>

        <div className="page-header-actions">
          <Link to={`/projects/${projectId}/entities`} className="button secondary">
            <Users size={16} />
            Manage Entities
          </Link>
          <Link to={`/projects/${projectId}/vdr`} className="button secondary">
            <FolderOpen size={16} />
            Documents
          </Link>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="graph-stats-bar">
          <div className="stat-item">
            <BarChart2 size={16} />
            <span className="stat-value">{stats.totalEntities}</span>
            <span className="stat-label">Total Entities</span>
          </div>
          <div className="stat-item">
            <GitBranch size={16} />
            <span className="stat-value">{stats.totalRelationships}</span>
            <span className="stat-label">Relationships</span>
          </div>
          <div className="stat-item">
            <Users size={16} />
            <span className="stat-value">{stats.entitiesWithRelationships}</span>
            <span className="stat-label">Connected</span>
          </div>
          <div className="stat-item orphan">
            <span className="stat-value">{stats.entitiesWithoutRelationships}</span>
            <span className="stat-label">Isolated</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="graph-explorer-content">
        <GraphExplorer
          graphData={graphData}
          loading={loading}
          error={error}
          entityTypeFilter={entityTypeFilter}
          selectedNodeId={selectedNodeId}
          onNodeClick={handleNodeClick}
          onEntityTypeFilterChange={setEntityTypeFilter}
          onRefresh={refreshGraph}
        />

        {/* Node Detail Panel */}
        {selectedNodeId && projectId && (
          <NodeDetailPanel
            nodeId={selectedNodeId}
            projectId={projectId}
            onClose={handleCloseDetailPanel}
            onEntityClick={handleEntityClickFromPanel}
            onDocumentClick={handleDocumentClick}
          />
        )}
      </div>
    </div>
  );
}
