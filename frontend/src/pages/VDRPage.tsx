import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import {
  FolderTree,
  DocumentList,
  Breadcrumb,
  CreateFolderModal,
  useFolders,
} from '../features/vdr';
import { membersService, apiClient } from '../api';
import { useAuth } from '../auth';
import type { ProjectMember, Document, FolderTreeNode } from '../types/api';
import '../features/vdr/vdr.css';

/**
 * Find a folder by ID in the tree
 */
function findFolderInTree(
  folders: FolderTreeNode[],
  folderId: string
): FolderTreeNode | null {
  for (const folder of folders) {
    if (folder.id === folderId) {
      return folder;
    }
    if (folder.children) {
      const found = findFolderInTree(folder.children, folderId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Virtual Data Room page component
 */
export function VDRPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, isLoading: authLoading } = useAuth();

  // Member state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Folder state
  const {
    folderTree,
    loading: foldersLoading,
    error: foldersError,
    selectedFolderId,
    folderPath,
    setSelectedFolderId,
    fetchFolders,
    createFolder,
  } = useFolders({ projectId, autoFetch: false });

  // Document state (placeholder - documents API not yet implemented)
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoading] = useState(false);

  // View mode state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modal state
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);

  // Get current user's membership info
  const currentUserMember = members.find((m) => m.user?.email === user?.email);
  const isAdmin =
    currentUserMember?.role === 'OWNER' || currentUserMember?.role === 'ADMIN';
  const canAccessVDR =
    isAdmin || currentUserMember?.permissions?.canAccessVDR !== false;
  const canUpload =
    isAdmin || currentUserMember?.permissions?.canUploadDocs === true;

  // Get selected folder name for display
  const selectedFolder = selectedFolderId
    ? findFolderInTree(folderTree, selectedFolderId)
    : null;
  const selectedFolderName = selectedFolder?.name;

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
        // Silently handle - VDR will still work
      } finally {
        setMembersLoading(false);
      }
    }

    fetchMembers();
  }, [projectId, authLoading]);

  // Fetch folders after members are loaded (to check permissions)
  useEffect(() => {
    if (!membersLoading && canAccessVDR && projectId) {
      fetchFolders();
    }
  }, [membersLoading, canAccessVDR, projectId, fetchFolders]);

  // Handle folder selection
  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
    // TODO: Fetch documents for selected folder when API is available
    setDocuments([]);
  }, [setSelectedFolderId]);

  // Handle create folder
  const handleOpenCreateFolder = useCallback((parentId: string | null) => {
    setCreateFolderParentId(parentId);
    setShowCreateFolderModal(true);
  }, []);

  const handleCreateFolder = useCallback(
    async (name: string, isViewOnly: boolean) => {
      await createFolder({
        name,
        parentId: createFolderParentId,
        isViewOnly,
      });
    },
    [createFolder, createFolderParentId]
  );

  // Handle document actions (placeholder)
  const handleUploadClick = useCallback(() => {
    // TODO: Implement document upload when API is available
    alert('Document upload will be available once S3 is configured.');
  }, []);

  const handleDocumentClick = useCallback((_document: Document) => {
    // TODO: Open document viewer
  }, []);

  const handleDocumentDownload = useCallback((_document: Document) => {
    // TODO: Implement download when API is available
  }, []);

  const handleDocumentDelete = useCallback((_document: Document) => {
    // TODO: Implement delete when API is available
  }, []);

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
      <div className="vdr-page">
        <div className="page-header">
          <Link to={`/projects/${projectId}`} className="back-link">
            <ArrowLeft size={16} />
            Back to Project
          </Link>
        </div>
        <div className="error-container">
          <h2>Access Denied</h2>
          <p>You do not have permission to access the Virtual Data Room.</p>
        </div>
      </div>
    );
  }

  // Get parent folder name for modal
  const createFolderParentName = createFolderParentId
    ? findFolderInTree(folderTree, createFolderParentId)?.name
    : undefined;

  return (
    <div className="vdr-page">
      {/* Page Header */}
      <div className="page-header">
        <Link to={`/projects/${projectId}`} className="back-link">
          <ArrowLeft size={16} />
          Back to Project
        </Link>

        {/* Search placeholder */}
        <div className="search-placeholder">
          <button className="button secondary" disabled title="Search coming soon">
            <Search size={16} />
            Search Documents
          </button>
        </div>
      </div>

      {/* Main VDR Content */}
      <div className="vdr-content">
        {/* Folder Sidebar */}
        <aside className="vdr-sidebar">
          {foldersError ? (
            <div className="error-container">
              <p>{foldersError}</p>
              <button className="button small primary" onClick={fetchFolders}>
                Retry
              </button>
            </div>
          ) : (
            <FolderTree
              folders={folderTree}
              selectedFolderId={selectedFolderId}
              onSelectFolder={handleSelectFolder}
              onCreateFolder={isAdmin ? handleOpenCreateFolder : undefined}
              isAdmin={isAdmin}
            />
          )}
        </aside>

        {/* Main Content Area */}
        <main className="vdr-main">
          {/* Breadcrumb Navigation */}
          <div className="vdr-breadcrumb">
            <Breadcrumb path={folderPath} onNavigate={handleSelectFolder} />
          </div>

          {/* Document List */}
          <div className="vdr-documents">
            <DocumentList
              documents={documents}
              loading={documentsLoading || foldersLoading}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onUploadClick={canUpload ? handleUploadClick : undefined}
              onDocumentClick={handleDocumentClick}
              onDocumentDownload={handleDocumentDownload}
              onDocumentDelete={isAdmin ? handleDocumentDelete : undefined}
              isAdmin={isAdmin}
              canUpload={canUpload}
              selectedFolderName={selectedFolderName}
            />
          </div>
        </main>
      </div>

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        onClose={() => setShowCreateFolderModal(false)}
        onSubmit={handleCreateFolder}
        parentFolderName={createFolderParentName}
      />
    </div>
  );
}
