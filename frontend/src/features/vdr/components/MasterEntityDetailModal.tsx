import { useState, useMemo } from 'react';
import {
  X,
  Edit2,
  Trash2,
  FileText,
  Users,
  Building2,
  MapPin,
  Scale,
  GitBranch,
  Save,
  Plus,
  Minus,
  ExternalLink,
} from 'lucide-react';
import type { MasterEntityDetail, EntityType } from '../../../types/api';
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS } from '../../../types/api';

interface MasterEntityDetailModalProps {
  entity: MasterEntityDetail;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  projectId: string;
  onClose: () => void;
  onUpdate: (data: { canonicalName?: string; aliases?: string[] }) => Promise<void>;
  onDelete: () => Promise<void>;
  onSplit: (docEntityIds: string[], newName: string) => Promise<void>;
  onDocumentClick: (documentId: string) => void;
  onRelatedEntityClick: (entityId: string) => void;
}

// Entity type icons
const ENTITY_TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  PERSON: Users,
  ORGANIZATION: Building2,
  LOCATION: MapPin,
  JURISDICTION: Scale,
};

/**
 * Get the icon component for an entity type
 */
function getEntityTypeIcon(entityType: string): React.FC<{ size?: number; className?: string }> {
  return ENTITY_TYPE_ICONS[entityType] || FileText;
}

/**
 * Icon wrapper for applying color via style
 */
function EntityIcon({ entityType, size = 16 }: { entityType: string; size?: number }) {
  const IconComponent = getEntityTypeIcon(entityType);
  const color = ENTITY_TYPE_COLORS[entityType as keyof typeof ENTITY_TYPE_COLORS] || '#6b7280';
  return (
    <span style={{ color, display: 'inline-flex' }}>
      <IconComponent size={size} />
    </span>
  );
}

/**
 * Modal for viewing and editing master entity details
 */
export function MasterEntityDetailModal({
  entity,
  loading,
  error,
  isAdmin,
  onClose,
  onUpdate,
  onDelete,
  onSplit,
  onDocumentClick,
  onRelatedEntityClick,
}: MasterEntityDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(entity.canonicalName);
  const [editAliases, setEditAliases] = useState<string[]>(entity.aliases || []);
  const [newAlias, setNewAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Split mode state
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedForSplit, setSelectedForSplit] = useState<Set<string>>(new Set());
  const [splitNewName, setSplitNewName] = useState('');
  const [splitting, setSplitting] = useState(false);

  // Group document entities by document
  const documentGroups = useMemo(() => {
    const groups = new Map<string, { document: { id: string; name: string; folderId: string | null }; mentions: typeof entity.documentEntities }>();

    for (const de of entity.documentEntities) {
      const docId = de.documentId;
      if (!groups.has(docId)) {
        groups.set(docId, {
          document: de.document,
          mentions: [],
        });
      }
      groups.get(docId)!.mentions.push(de);
    }

    return Array.from(groups.values());
  }, [entity.documentEntities]);

  // Related entities (both directions)
  const relatedEntities = useMemo(() => {
    const related = new Map<string, { id: string; canonicalName: string; entityType: EntityType; direction: 'outgoing' | 'incoming' }>();

    for (const rel of entity.relatedEntities) {
      related.set(rel.targetEntity.id, {
        ...rel.targetEntity,
        direction: 'outgoing',
      });
    }

    for (const rel of entity.relatedFrom) {
      if (!related.has(rel.sourceEntity.id)) {
        related.set(rel.sourceEntity.id, {
          ...rel.sourceEntity,
          direction: 'incoming',
        });
      }
    }

    return Array.from(related.values());
  }, [entity.relatedEntities, entity.relatedFrom]);

  // Handle save
  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        canonicalName: editName !== entity.canonicalName ? editName : undefined,
        aliases: editAliases,
      });
      setIsEditing(false);
    } catch {
      // Error handling done in parent
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditName(entity.canonicalName);
    setEditAliases(entity.aliases || []);
    setIsEditing(false);
  };

  // Handle add alias
  const handleAddAlias = () => {
    if (newAlias.trim() && !editAliases.includes(newAlias.trim())) {
      setEditAliases([...editAliases, newAlias.trim()]);
      setNewAlias('');
    }
  };

  // Handle remove alias
  const handleRemoveAlias = (alias: string) => {
    setEditAliases(editAliases.filter((a) => a !== alias));
  };

  // Handle delete
  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${entity.canonicalName}"? This will unlink all document mentions but not delete them.`)) {
      return;
    }

    setDeleting(true);
    try {
      await onDelete();
    } catch {
      // Error handling done in parent
    } finally {
      setDeleting(false);
    }
  };

  // Toggle document entity for split
  const toggleSplitSelection = (deId: string) => {
    setSelectedForSplit((prev) => {
      const next = new Set(prev);
      if (next.has(deId)) {
        next.delete(deId);
      } else {
        next.add(deId);
      }
      return next;
    });
  };

  // Handle split
  const handleSplit = async () => {
    if (selectedForSplit.size === 0 || !splitNewName.trim()) {
      return;
    }

    setSplitting(true);
    try {
      await onSplit(Array.from(selectedForSplit), splitNewName.trim());
      setIsSplitMode(false);
      setSelectedForSplit(new Set());
      setSplitNewName('');
    } catch {
      // Error handling done in parent
    } finally {
      setSplitting(false);
    }
  };

  // Handle cancel split
  const handleCancelSplit = () => {
    setIsSplitMode(false);
    setSelectedForSplit(new Set());
    setSplitNewName('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content entity-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="entity-detail-header-content">
            <EntityIcon entityType={entity.entityType} size={24} />
            <div className="entity-header-info">
              {isEditing ? (
                <input
                  type="text"
                  className="edit-name-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
              ) : (
                <h2>{entity.canonicalName}</h2>
              )}
              <span
                className="entity-type-badge"
                style={{ backgroundColor: ENTITY_TYPE_COLORS[entity.entityType] }}
              >
                {ENTITY_TYPE_LABELS[entity.entityType]}
              </span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Loading/Error states */}
        {loading && (
          <div className="entity-detail-loading">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        )}

        {error && (
          <div className="entity-detail-error">
            <p>{error}</p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <div className="modal-body">
            {/* Aliases section */}
            <section className="entity-detail-section">
              <h3>Aliases</h3>
              {isEditing ? (
                <div className="aliases-edit">
                  <div className="aliases-list-edit">
                    {editAliases.map((alias) => (
                      <div key={alias} className="alias-chip editable">
                        <span>{alias}</span>
                        <button onClick={() => handleRemoveAlias(alias)}>
                          <Minus size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="add-alias-input">
                    <input
                      type="text"
                      placeholder="Add alias..."
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
                    />
                    <button onClick={handleAddAlias} disabled={!newAlias.trim()}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aliases-list">
                  {entity.aliases && entity.aliases.length > 0 ? (
                    entity.aliases.map((alias) => (
                      <span key={alias} className="alias-chip">
                        {alias}
                      </span>
                    ))
                  ) : (
                    <p className="no-data">No aliases</p>
                  )}
                </div>
              )}
            </section>

            {/* Documents section */}
            <section className="entity-detail-section">
              <div className="section-header">
                <h3>Documents ({documentGroups.length})</h3>
                {isAdmin && !isEditing && documentGroups.length > 0 && (
                  <button
                    className={`button small ${isSplitMode ? 'primary' : 'secondary'}`}
                    onClick={() => setIsSplitMode(!isSplitMode)}
                  >
                    <GitBranch size={14} />
                    {isSplitMode ? 'Cancel Split' : 'Split Entity'}
                  </button>
                )}
              </div>

              {isSplitMode && (
                <div className="split-mode-info">
                  <p>Select mentions to split into a new entity:</p>
                  <div className="split-input">
                    <input
                      type="text"
                      placeholder="New entity name..."
                      value={splitNewName}
                      onChange={(e) => setSplitNewName(e.target.value)}
                    />
                    <button
                      className="button small primary"
                      onClick={handleSplit}
                      disabled={selectedForSplit.size === 0 || !splitNewName.trim() || splitting}
                    >
                      {splitting ? 'Splitting...' : `Split ${selectedForSplit.size} mentions`}
                    </button>
                    <button className="button small secondary" onClick={handleCancelSplit}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="documents-list">
                {documentGroups.length === 0 ? (
                  <p className="no-data">No documents mention this entity</p>
                ) : (
                  documentGroups.map(({ document, mentions }) => (
                    <div key={document.id} className="document-group">
                      <div
                        className="document-header"
                        onClick={() => onDocumentClick(document.id)}
                      >
                        <FileText size={16} />
                        <span className="document-name">{document.name}</span>
                        <ExternalLink size={14} className="external-icon" />
                      </div>
                      <div className="mentions-list">
                        {mentions.map((mention) => (
                          <div
                            key={mention.id}
                            className={`mention-item ${isSplitMode ? 'selectable' : ''} ${selectedForSplit.has(mention.id) ? 'selected' : ''}`}
                            onClick={() => isSplitMode && toggleSplitSelection(mention.id)}
                          >
                            {isSplitMode && (
                              <input
                                type="checkbox"
                                checked={selectedForSplit.has(mention.id)}
                                onChange={() => toggleSplitSelection(mention.id)}
                              />
                            )}
                            <span className="mention-text">"{mention.text}"</span>
                            {mention.pageNumber && (
                              <span className="mention-page">Page {mention.pageNumber}</span>
                            )}
                            <span className="mention-confidence">
                              {Math.round(mention.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Related entities section */}
            {relatedEntities.length > 0 && (
              <section className="entity-detail-section">
                <h3>Related Entities ({relatedEntities.length})</h3>
                <div className="related-entities-list">
                  {relatedEntities.map((rel) => (
                    <div
                      key={rel.id}
                      className="related-entity-item"
                      onClick={() => onRelatedEntityClick(rel.id)}
                    >
                      <EntityIcon entityType={rel.entityType} size={14} />
                      <span className="related-entity-name">{rel.canonicalName}</span>
                      <span
                        className="entity-type-badge small"
                        style={{ backgroundColor: ENTITY_TYPE_COLORS[rel.entityType] }}
                      >
                        {ENTITY_TYPE_LABELS[rel.entityType]}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          {isEditing ? (
            <>
              <button
                className="button secondary"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="button primary"
                onClick={handleSave}
                disabled={saving || !editName.trim()}
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              {isAdmin && (
                <>
                  <button
                    className="button danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 size={14} />
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                </>
              )}
              <button className="button primary" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
