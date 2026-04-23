import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, FileText, Search, Folder, FolderOpen, ChevronRight, ChevronDown, Loader, CheckCircle } from 'lucide-react';
import { foldersService } from '../../../api/services/folders.service';
import { documentsService } from '../../../api/services/documents.service';
import type { FolderTreeNode, Document } from '../../../types/api';

interface LinkDocumentModalProps {
  isOpen: boolean;
  projectId: string;
  alreadyLinkedDocumentIds: string[];
  /**
   * Folder IDs this task's board is scoped to. When provided, the picker only
   * shows those folders (and their descendants), and documents not in them are
   * hidden. Backend enforces this too — frontend filter is a UX guardrail.
   */
  boardFolderIds?: string[];
  onClose: () => void;
  onLink: (documentId: string) => Promise<void>;
}

interface SimpleFolderItemProps {
  folder: FolderTreeNode;
  level: number;
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  onSelect: (folderId: string | null) => void;
  onToggle: (folderId: string) => void;
}

/**
 * Simple folder item for the picker (no edit actions)
 */
function SimpleFolderItem({
  folder,
  level,
  selectedFolderId,
  expandedIds,
  onSelect,
  onToggle,
}: SimpleFolderItemProps) {
  const hasChildren = folder.children && folder.children.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;

  return (
    <div className="picker-folder-item">
      <div
        className={`picker-folder-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(folder.id)}
      >
        <button
          className="picker-folder-toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(folder.id);
          }}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span style={{ width: 14 }} />
          )}
        </button>
        <span className="picker-folder-icon">
          {isExpanded && hasChildren ? <FolderOpen size={16} /> : <Folder size={16} />}
        </span>
        <span className="picker-folder-name">{folder.name}</span>
      </div>
      {hasChildren && isExpanded && (
        <div className="picker-folder-children">
          {folder.children.map((child) => (
            <SimpleFolderItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Modal for selecting documents from the VDR to link to a task
 */
/**
 * Prune a folder tree to only branches whose root or descendants are allowed.
 * A folder is kept if its id is in allowedIds OR any descendant is.
 */
function pruneFolderTree(tree: FolderTreeNode[], allowedIds: Set<string>): FolderTreeNode[] {
  const walk = (nodes: FolderTreeNode[]): FolderTreeNode[] => {
    const out: FolderTreeNode[] = [];
    for (const n of nodes) {
      const keptChildren = walk(n.children ?? []);
      if (allowedIds.has(n.id) || keptChildren.length > 0) {
        out.push({ ...n, children: keptChildren });
      }
    }
    return out;
  };
  return walk(tree);
}

/**
 * Given a board's folder ids and a full folder tree, return the set of every
 * folder id *within* those branches (so children of a selected parent count).
 */
function expandFolderScope(tree: FolderTreeNode[], scopeIds: string[]): Set<string> {
  const scope = new Set(scopeIds);
  const out = new Set<string>();
  const walk = (nodes: FolderTreeNode[], insideScope: boolean) => {
    for (const n of nodes) {
      const nowInside = insideScope || scope.has(n.id);
      if (nowInside) out.add(n.id);
      if (n.children) walk(n.children, nowInside);
    }
  };
  walk(tree, false);
  return out;
}

export function LinkDocumentModal({
  isOpen,
  projectId,
  alreadyLinkedDocumentIds,
  boardFolderIds,
  onClose,
  onLink,
}: LinkDocumentModalProps) {
  const [folders, setFolders] = useState<FolderTreeNode[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Set of every folder id within the board's scope.
  // Seed with the raw boardFolderIds (always trusted, even before the folder
  // tree has loaded) and add tree-walked descendants so that selecting a
  // parent folder also admits documents in its subfolders.
  // Returning null means "no scope restriction" — every doc passes.
  const allowedFolderIds = useMemo(() => {
    if (!boardFolderIds || boardFolderIds.length === 0) return null;
    const out = new Set<string>(boardFolderIds);
    if (folders.length > 0) {
      const expanded = expandFolderScope(folders, boardFolderIds);
      expanded.forEach((id) => out.add(id));
    }
    return out;
  }, [folders, boardFolderIds]);

  // Tree pruned to only the board's scope branches.
  const visibleFolders = useMemo(() => {
    if (!allowedFolderIds) return folders;
    return pruneFolderTree(folders, allowedFolderIds);
  }, [folders, allowedFolderIds]);

  // Fetch folders on open
  useEffect(() => {
    if (!isOpen || !projectId) return;

    const fetchFolders = async () => {
      setLoading(true);
      try {
        const folderTree = await foldersService.getFolderTree(projectId);
        setFolders(folderTree);
        // Expand first level
        setExpandedIds(new Set(folderTree.map((f) => f.id)));
      } catch (err) {
        setError('Failed to load folders');
      } finally {
        setLoading(false);
      }
    };

    fetchFolders();
  }, [isOpen, projectId]);

  // Fetch documents when folder changes
  useEffect(() => {
    if (!isOpen || !projectId) return;

    const fetchDocuments = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await documentsService.listDocuments(projectId, {
          folderId: selectedFolderId,
          limit: 100,
        });
        setDocuments(response.documents);
      } catch (err) {
        console.error('Failed to load documents:', err);
        setError('Failed to load documents');
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [isOpen, projectId, selectedFolderId]);

  const handleToggle = useCallback((folderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleLinkDocument = async (documentId: string) => {
    if (alreadyLinkedDocumentIds.includes(documentId)) return;

    setLinkingId(documentId);
    setError(null);
    try {
      await onLink(documentId);
    } catch (err) {
      setError('Failed to link document');
    } finally {
      setLinkingId(null);
    }
  };

  // Filter documents by board scope, then by search query.
  const filteredDocuments = documents
    .filter((doc) => {
      if (!allowedFolderIds) return true;
      // Docs with no folder are ineligible when a board scope is active.
      if (!doc.folderId) return false;
      return allowedFolderIds.has(doc.folderId);
    })
    .filter((doc) => doc.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal link-document-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <FileText size={20} />
            Attach Document
          </h3>
          <button className="button ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-content">
          {/* Search */}
          <div className="document-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="document-picker-layout">
            {/* Folder tree */}
            <div className="document-picker-folders">
              <div className="picker-folders-header">
                <h4>Folders</h4>
              </div>
              <div className="picker-folders-content">
                {loading ? (
                  <div className="picker-loading">
                    <Loader size={16} className="spinning" />
                  </div>
                ) : (
                  <>
                    {/* All Documents option (scoped to this board when applicable) */}
                    <div
                      className={`picker-folder-row all-documents ${selectedFolderId === null ? 'selected' : ''}`}
                      onClick={() => setSelectedFolderId(null)}
                    >
                      <span style={{ width: 14 }} />
                      <span className="picker-folder-icon">
                        <FolderOpen size={16} />
                      </span>
                      <span className="picker-folder-name">
                        {allowedFolderIds ? 'All Board Documents' : 'All Documents'}
                      </span>
                    </div>
                    {visibleFolders.map((folder) => (
                      <SimpleFolderItem
                        key={folder.id}
                        folder={folder}
                        level={0}
                        selectedFolderId={selectedFolderId}
                        expandedIds={expandedIds}
                        onSelect={setSelectedFolderId}
                        onToggle={handleToggle}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Documents list */}
            <div className="document-picker-documents">
              <div className="picker-documents-header">
                <h4>Documents</h4>
              </div>
              <div className="picker-documents-content">
                {loading ? (
                  <div className="picker-loading">
                    <Loader size={16} className="spinning" />
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="picker-documents-empty">
                    <FileText size={32} />
                    <p>No documents available</p>
                    <p className="picker-documents-hint">
                      Documents will appear here once you upload files to the Data Room.
                    </p>
                  </div>
                ) : (
                  <div className="picker-documents-list">
                    {filteredDocuments.map((doc) => {
                      const isAlreadyLinked = alreadyLinkedDocumentIds.includes(doc.id);
                      const isLinking = linkingId === doc.id;

                      return (
                        <div
                          key={doc.id}
                          className={`picker-document-item ${isAlreadyLinked ? 'already-linked' : ''}`}
                          onClick={() => !isAlreadyLinked && handleLinkDocument(doc.id)}
                        >
                          <FileText size={16} />
                          <div className="picker-document-info">
                            <span className="picker-document-name">{doc.name}</span>
                            <span className="picker-document-meta">
                              {formatFileSize(doc.sizeBytes)}
                            </span>
                          </div>
                          {isAlreadyLinked ? (
                            <span className="picker-document-linked">
                              <CheckCircle size={16} />
                              Linked
                            </span>
                          ) : isLinking ? (
                            <Loader size={16} className="spinning" />
                          ) : (
                            <button className="button small primary">Link</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
