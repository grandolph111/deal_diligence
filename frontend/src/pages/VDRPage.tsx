import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Search, MessageSquare } from 'lucide-react';
import {
  FolderTree,
  DocumentList,
  Breadcrumb,
  CreateFolderModal,
  RenameFolderModal,
  DeleteFolderModal,
  DocumentViewer,
  FactSheetModal,
  SearchPanel,
  UploadDropZone,
  UploadProgressModal,
  MoveDocumentModal,
  useFolders,
  useDocuments,
} from '../features/vdr';
import { ChatPanel } from '../features/chat';
import { membersService, apiClient, documentsService } from '../api';
import { useAuth } from '../auth';
import type { ProjectMember, Document, FolderTreeNode } from '../types/api';
import '../features/vdr/vdr.css';
import '../features/chat/chat.css';

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

interface RenameFolderState {
  isOpen: boolean;
  folderId: string | null;
  currentName: string;
}

interface DeleteFolderState {
  isOpen: boolean;
  folderId: string | null;
  folderName: string;
  hasChildren: boolean;
  documentCount: number;
}

interface MoveDocumentState {
  isOpen: boolean;
  document: Document | null;
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
    documentCounts,
    setSelectedFolderId,
    fetchFolders,
    createFolder,
    renameFolder,
    deleteFolder,
  } = useFolders({ projectId, autoFetch: false });

  // Document state
  const {
    documents,
    loading: documentsLoading,
    error: documentsError,
    uploadProgress,
    isUploading,
    fetchDocuments,
    uploadFiles,
    deleteDocument,
    moveDocument,
    refreshDocuments,
    clearUploadProgress,
  } = useDocuments({ projectId });

  // View mode state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Modal states
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  const [renameFolderState, setRenameFolderState] = useState<RenameFolderState>({
    isOpen: false,
    folderId: null,
    currentName: '',
  });

  const [deleteFolderState, setDeleteFolderState] = useState<DeleteFolderState>({
    isOpen: false,
    folderId: null,
    folderName: '',
    hasChildren: false,
    documentCount: 0,
  });

  const [moveDocumentState, setMoveDocumentState] = useState<MoveDocumentState>({
    isOpen: false,
    document: null,
  });

  // Document viewer state
  const [viewerDocument, setViewerDocument] = useState<Document | null>(null);
  const [viewerPdfUrl, setViewerPdfUrl] = useState<string | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  const [extractionDocument, setExtractionDocument] = useState<Document | null>(null);

  const handleViewExtraction = useCallback((document: Document) => {
    setExtractionDocument(document);
  }, []);

  // Search panel state
  const [showSearchPanel, setShowSearchPanel] = useState(false);

  // Chat panel state
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatInitialDocument, setChatInitialDocument] = useState<{ id: string; name: string } | null>(null);

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

  // Fetch documents when folder changes
  useEffect(() => {
    if (!membersLoading && canAccessVDR && projectId) {
      fetchDocuments({ folderId: selectedFolderId });
    }
  }, [membersLoading, canAccessVDR, projectId, selectedFolderId, fetchDocuments]);

  // Handle folder selection
  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
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

  // Handle rename folder
  const handleOpenRenameFolder = useCallback((folderId: string, currentName: string) => {
    setRenameFolderState({
      isOpen: true,
      folderId,
      currentName,
    });
  }, []);

  const handleCloseRenameFolder = useCallback(() => {
    setRenameFolderState({
      isOpen: false,
      folderId: null,
      currentName: '',
    });
  }, []);

  const handleRenameFolder = useCallback(
    async (newName: string) => {
      if (renameFolderState.folderId) {
        await renameFolder(renameFolderState.folderId, newName);
      }
    },
    [renameFolder, renameFolderState.folderId]
  );

  // Handle delete folder
  const handleOpenDeleteFolder = useCallback((
    folderId: string,
    folderName: string,
    hasChildren: boolean,
    documentCount: number
  ) => {
    setDeleteFolderState({
      isOpen: true,
      folderId,
      folderName,
      hasChildren,
      documentCount,
    });
  }, []);

  const handleCloseDeleteFolder = useCallback(() => {
    setDeleteFolderState({
      isOpen: false,
      folderId: null,
      folderName: '',
      hasChildren: false,
      documentCount: 0,
    });
  }, []);

  const handleDeleteFolder = useCallback(async () => {
    if (deleteFolderState.folderId) {
      await deleteFolder(deleteFolderState.folderId);
    }
  }, [deleteFolder, deleteFolderState.folderId]);

  // Handle file upload
  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      setShowUploadProgress(true);
      await uploadFiles(files, selectedFolderId);
      // Refresh folder counts after upload
      fetchFolders();
    },
    [uploadFiles, selectedFolderId, fetchFolders]
  );

  const handleCloseUploadProgress = useCallback(() => {
    setShowUploadProgress(false);
    clearUploadProgress();
  }, [clearUploadProgress]);

  // Handle document click (view)
  const handleDocumentClick = useCallback(async (doc: Document) => {
    setViewerDocument(doc);

    // Try to get download URL for PDF viewing
    if (projectId && doc.mimeType === 'application/pdf') {
      try {
        const docWithUrl = await documentsService.getDocumentWithDownloadUrl(projectId, doc.id);
        setViewerPdfUrl(docWithUrl.downloadUrl);
      } catch {
        // If we can't get the URL, viewer will show error state
        setViewerPdfUrl(null);
      }
    } else {
      setViewerPdfUrl(null);
    }

    setShowViewer(true);
  }, [projectId]);

  const handleCloseViewer = useCallback(() => {
    setShowViewer(false);
    setViewerDocument(null);
    setViewerPdfUrl(null);
  }, []);

  // Handle document download
  const handleDocumentDownload = useCallback(async (document: Document) => {
    if (!projectId) return;

    try {
      const docWithUrl = await documentsService.getDocumentWithDownloadUrl(projectId, document.id);
      // Open download URL in new tab
      window.open(docWithUrl.downloadUrl, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download document');
    }
  }, [projectId]);

  // Handle document delete
  const handleDocumentDelete = useCallback(async (document: Document) => {
    if (!confirm(`Are you sure you want to delete "${document.name}"?`)) {
      return;
    }

    try {
      await deleteDocument(document.id);
      // Refresh folder counts after delete
      fetchFolders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete document');
    }
  }, [deleteDocument, fetchFolders]);

  // Handle document move
  const handleOpenMoveDocument = useCallback((document: Document) => {
    setMoveDocumentState({
      isOpen: true,
      document,
    });
  }, []);

  const handleCloseMoveDocument = useCallback(() => {
    setMoveDocumentState({
      isOpen: false,
      document: null,
    });
  }, []);

  const handleMoveDocument = useCallback(async (folderId: string | null) => {
    if (!moveDocumentState.document) return;

    await moveDocument(moveDocumentState.document.id, folderId);
    // Refresh both documents and folder counts
    refreshDocuments();
    fetchFolders();
  }, [moveDocumentState.document, moveDocument, refreshDocuments, fetchFolders]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(async (docs: Document[]) => {
    if (!confirm(`Are you sure you want to delete ${docs.length} documents?`)) {
      return;
    }

    for (const doc of docs) {
      try {
        await deleteDocument(doc.id);
      } catch {
        // Continue with other deletions
      }
    }

    // Refresh folder counts after delete
    fetchFolders();
  }, [deleteDocument, fetchFolders]);

  // Handle bulk download
  const handleBulkDownload = useCallback(async (docs: Document[]) => {
    if (!projectId) return;

    // Download each document (opens in new tabs)
    for (const doc of docs) {
      try {
        const docWithUrl = await documentsService.getDocumentWithDownloadUrl(projectId, doc.id);
        window.open(docWithUrl.downloadUrl, '_blank');
      } catch {
        // Continue with other downloads
      }
    }
  }, [projectId]);

  const handleRequestAccess = useCallback((_document: Document) => {
    // TODO: Implement request access functionality
    alert('Access request functionality coming soon.');
  }, []);

  // Handle request access from search (by document ID)
  const handleRequestAccessById = useCallback((_documentId: string) => {
    // TODO: Implement request access functionality
    alert('Access request functionality coming soon.');
  }, []);

  // Handle search panel open/close
  const handleOpenSearch = useCallback(() => {
    setShowSearchPanel(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setShowSearchPanel(false);
  }, []);

  // Handle chat panel open/close
  const handleOpenChat = useCallback(() => {
    setShowChatPanel(true);
  }, []);

  const handleCloseChat = useCallback(() => {
    setShowChatPanel(false);
    setChatInitialDocument(null);
  }, []);

  // Handle opening chat with a specific document context
  const handleOpenChatWithDocument = useCallback((doc: Document) => {
    setChatInitialDocument({ id: doc.id, name: doc.name });
    setShowChatPanel(true);
  }, []);

  // Handle document click from chat citations
  const handleChatDocumentClick = useCallback((documentId: string) => {
    // Close chat panel
    setShowChatPanel(false);

    // Find the document to get its folder
    const doc = documents.find((d) => d.id === documentId);
    if (doc) {
      // Navigate to the folder
      if (doc.folderId !== selectedFolderId) {
        handleSelectFolder(doc.folderId);
      }
      // Open the document viewer
      handleDocumentClick(doc);
    }
  }, [documents, selectedFolderId, handleSelectFolder, handleDocumentClick]);

  // Handle document click from search results
  const handleSearchDocumentClick = useCallback((documentId: string, folderId: string | null) => {
    // Navigate to the folder containing the document
    if (folderId !== selectedFolderId) {
      handleSelectFolder(folderId);
    }

    // Find and open the document
    const doc = documents.find((d) => d.id === documentId);
    if (doc) {
      handleDocumentClick(doc);
    }
  }, [selectedFolderId, documents, handleSelectFolder, handleDocumentClick]);

  // Handle document update from viewer (e.g., when processing completes)
  const handleDocumentUpdate = useCallback((updatedDoc: Document) => {
    // Update the viewer document state
    setViewerDocument(updatedDoc);
    // Refresh the document list to reflect changes
    refreshDocuments();
  }, [refreshDocuments]);

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

  // Get parent folder name for create modal
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

        <div className="documents-header-actions">
          {/* Upload button (compact) */}
          {canUpload && (
            <UploadDropZone
              onFilesSelected={handleFilesSelected}
              disabled={isUploading}
              compact
            />
          )}

          {/* Search button */}
          <button className="button secondary" onClick={handleOpenSearch}>
            <Search size={16} />
            Search
          </button>

          {/* Chat button */}
          <button className="button secondary" onClick={handleOpenChat}>
            <MessageSquare size={16} />
            AI Chat
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
              onRenameFolder={isAdmin ? handleOpenRenameFolder : undefined}
              onDeleteFolder={isAdmin ? handleOpenDeleteFolder : undefined}
              isAdmin={isAdmin}
              documentCounts={documentCounts}
            />
          )}
        </aside>

        {/* Main Content Area */}
        <main className="vdr-main">
          {/* Breadcrumb Navigation */}
          <div className="vdr-breadcrumb">
            <Breadcrumb path={folderPath} onNavigate={handleSelectFolder} />
          </div>

          {/* Error display */}
          {documentsError && (
            <div className="error-banner">
              <p>{documentsError}</p>
              <button className="button small secondary" onClick={refreshDocuments}>
                Retry
              </button>
            </div>
          )}

          {/* Document List */}
          <div className="vdr-documents">
            {/* Show drop zone when no documents and can upload */}
            {!documentsLoading && !foldersLoading && documents.length === 0 && canUpload && (
              <UploadDropZone
                onFilesSelected={handleFilesSelected}
                disabled={isUploading}
              />
            )}

            <DocumentList
              documents={documents}
              loading={documentsLoading || foldersLoading}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onUploadClick={canUpload ? () => {} : undefined}
              onDocumentClick={handleDocumentClick}
              onDocumentDownload={handleDocumentDownload}
              onDocumentDelete={isAdmin ? handleDocumentDelete : undefined}
              onDocumentMove={isAdmin ? handleOpenMoveDocument : undefined}
              onBulkDelete={isAdmin ? handleBulkDelete : undefined}
              onBulkDownload={handleBulkDownload}
              onRequestAccess={handleRequestAccess}
              onViewExtraction={handleViewExtraction}
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

      {/* Rename Folder Modal */}
      <RenameFolderModal
        isOpen={renameFolderState.isOpen}
        onClose={handleCloseRenameFolder}
        onSubmit={handleRenameFolder}
        currentName={renameFolderState.currentName}
      />

      {/* Delete Folder Modal */}
      <DeleteFolderModal
        isOpen={deleteFolderState.isOpen}
        onClose={handleCloseDeleteFolder}
        onConfirm={handleDeleteFolder}
        folderName={deleteFolderState.folderName}
        hasChildren={deleteFolderState.hasChildren}
        documentCount={deleteFolderState.documentCount}
      />

      {/* Move Document Modal */}
      {moveDocumentState.document && (
        <MoveDocumentModal
          isOpen={moveDocumentState.isOpen}
          onClose={handleCloseMoveDocument}
          onSubmit={handleMoveDocument}
          documentName={moveDocumentState.document.name}
          currentFolderId={moveDocumentState.document.folderId}
          folders={folderTree}
        />
      )}

      {/* Upload Progress Modal */}
      <UploadProgressModal
        isOpen={showUploadProgress}
        onClose={handleCloseUploadProgress}
        uploadProgress={uploadProgress}
        isUploading={isUploading}
      />

      {/* Document Viewer */}
      {showViewer && viewerDocument && projectId && (
        <DocumentViewer
          document={viewerDocument}
          pdfUrl={viewerPdfUrl}
          isViewOnly={viewerDocument.isViewOnly || selectedFolder?.isViewOnly}
          projectId={projectId}
          onClose={handleCloseViewer}
          onDownload={handleDocumentDownload}
          canEditClassification={isAdmin}
          onDocumentUpdate={handleDocumentUpdate}
          onAskAI={handleOpenChatWithDocument}
        />
      )}

      {/* Fact-sheet (extraction) Viewer */}
      {projectId && (
        <FactSheetModal
          isOpen={!!extractionDocument}
          projectId={projectId}
          documentId={extractionDocument?.id ?? null}
          documentName={extractionDocument?.name ?? null}
          onClose={() => setExtractionDocument(null)}
        />
      )}

      {/* Search Panel */}
      <SearchPanel
        projectId={projectId}
        folders={folderTree}
        isOpen={showSearchPanel}
        onClose={handleCloseSearch}
        onDocumentClick={handleSearchDocumentClick}
        onRequestAccess={handleRequestAccessById}
      />

      {/* Chat Panel */}
      <ChatPanel
        projectId={projectId}
        isOpen={showChatPanel}
        onClose={handleCloseChat}
        onDocumentClick={handleChatDocumentClick}
        initialDocument={chatInitialDocument}
      />
    </div>
  );
}
