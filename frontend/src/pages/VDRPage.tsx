import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, MessageSquare } from 'lucide-react';
import {
  LibraryTree,
  DocumentList,
  DocumentViewer,
  FactSheetModal,
  ClauseComparisonModal,
  SearchPanel,
  UploadDropZone,
  UploadProgressModal,
  MoveDocumentModal,
  useFolders,
  useDocuments,
  useLibraryToc,
} from '../features/vdr';
import type { LibrarySelection } from '../features/vdr/components/LibraryTree';
import { ChatPanel } from '../features/chat';
import { membersService, apiClient, documentsService } from '../api';
import { useAuth } from '../auth';
import type { ProjectMember, Document } from '../types/api';
import '../features/vdr/vdr.css';
import '../features/chat/chat.css';

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

  // Checklist navigation. The data room is scoped by workstream / checklist
  // item; `null` means the whole deal.
  const [searchParams, setSearchParams] = useSearchParams();
  const [selection, setSelection] = useState<LibrarySelection | null>(() => {
    // Deep link from the deal map: ?workstream=<id> or ?unfiled=1.
    const ws = searchParams.get('workstream');
    if (ws) return { workstreamId: ws };
    if (searchParams.get('unfiled') === '1') return { unfiled: true };
    return null;
  });
  const {
    toc,
    loading: tocLoading,
    error: tocError,
    refresh: refreshToc,
  } = useLibraryToc({ projectId: projectId ?? '', autoFetch: false });

  // Folder state — dormant. Folders are retired from navigation but remain the
  // physical home for uploads and the legacy permission paths.
  const {
    folderTree,
    loading: foldersLoading,
    selectedFolderId,
    fetchFolders,
  } = useFolders({ projectId, autoFetch: false });

  // Document state
  const {
    documents,
    pagination,
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
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  const [moveDocumentState, setMoveDocumentState] = useState<MoveDocumentState>({
    isOpen: false,
    document: null,
  });

  // Document viewer state
  const [viewerDocument, setViewerDocument] = useState<Document | null>(null);
  const [viewerPdfUrl, setViewerPdfUrl] = useState<string | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  const [extractionDocument, setExtractionDocument] = useState<Document | null>(null);
  const [comparingClause, setComparingClause] = useState<string | null>(null);

  /**
   * Follow a backlink to another document's fact sheet. The target is usually
   * outside the loaded list (backlinks reach across the whole deal), so fetch
   * it rather than searching what happens to be on screen.
   */
  const handleOpenRelatedExtraction = useCallback(
    async (id: string) => {
      if (!projectId) return;
      const loaded = documents.find((d) => d.id === id);
      if (loaded) {
        setExtractionDocument(loaded);
        return;
      }
      try {
        setExtractionDocument(await documentsService.getDocument(projectId, id));
      } catch {
        // Non-fatal: the link points somewhere this user cannot reach.
      }
    },
    [projectId, documents]
  );

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

  // Fetch the checklist + folders after members are loaded (to check permissions)
  useEffect(() => {
    if (!membersLoading && canAccessVDR && projectId) {
      refreshToc();
      fetchFolders();
    }
  }, [membersLoading, canAccessVDR, projectId, refreshToc, fetchFolders]);

  // Fetch documents when the checklist scope changes
  useEffect(() => {
    if (!membersLoading && canAccessVDR && projectId) {
      // Load up to the API's max page size (100) so the list isn't silently capped
      // at the default 20. Data rooms above 100 docs need real pagination — follow-up.
      fetchDocuments({
        workstreamId: selection?.workstreamId,
        unfiled: selection?.unfiled,
        limit: 100,
      });
    }
  }, [membersLoading, canAccessVDR, projectId, selection, fetchDocuments]);

  const handleSelectScope = useCallback(
    (next: LibrarySelection | null) => {
      setSelection(next);
      // Keep the scope in the URL so the view is linkable and survives reload.
      const params = new URLSearchParams(searchParams);
      params.delete('workstream');
      params.delete('unfiled');
      if (next?.workstreamId) params.set('workstream', next.workstreamId);
      if (next?.unfiled) params.set('unfiled', '1');
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // The active tab already names the scope; the list heading just echoes it.
  const scopeLabel = useMemo(() => {
    if (selection?.unfiled) return 'Not yet analyzed';
    const ws = toc?.workstreams.find((w) => w.id === selection?.workstreamId);
    return ws?.title ?? 'All Documents';
  }, [selection, toc]);

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

  /**
   * Open a document by id, wherever it lives.
   *
   * Citations and search results routinely point outside the active checklist
   * scope, and a document has no single home to navigate to any more. So fetch
   * it directly rather than trying to move the tree to it — the viewer works
   * off the document itself, not the current scope.
   */
  const openDocumentById = useCallback(
    async (documentId: string) => {
      const loaded = documents.find((d) => d.id === documentId);
      if (loaded) {
        handleDocumentClick(loaded);
        return;
      }
      if (!projectId) return;
      try {
        handleDocumentClick(await documentsService.getDocument(projectId, documentId));
      } catch {
        // Non-fatal: the citation points at something this user cannot reach.
      }
    },
    [documents, projectId, handleDocumentClick]
  );

  // Handle document click from chat citations
  const handleChatDocumentClick = useCallback(
    (documentId: string) => {
      setShowChatPanel(false);
      void openDocumentById(documentId);
    },
    [openDocumentById]
  );

  // Handle document click from search results
  const handleSearchDocumentClick = useCallback(
    (documentId: string) => {
      void openDocumentById(documentId);
    },
    [openDocumentById]
  );

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
        <aside className="vdr-sidebar">
          <LibraryTree
            toc={toc}
            loading={tocLoading}
            error={tocError}
            selection={selection}
            onSelect={handleSelectScope}
          />
        </aside>

        <main className="vdr-main">

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
              totalCount={pagination?.total}
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
              selectedFolderName={scopeLabel}
            />
          </div>
        </main>
      </div>

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
          isViewOnly={viewerDocument.isViewOnly}
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
          onCompareClause={setComparingClause}
          onOpenDocument={handleOpenRelatedExtraction}
        />
      )}

      {/* Peer comparison — every version of one clause across the deal */}
      {projectId && (
        <ClauseComparisonModal
          projectId={projectId}
          clauseType={comparingClause}
          onClose={() => setComparingClause(null)}
          onOpenDocument={handleOpenRelatedExtraction}
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
