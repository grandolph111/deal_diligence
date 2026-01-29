import { useState, useEffect } from 'react';
import {
  X,
  Merge,
  ArrowRight,
  Users,
  Building2,
  MapPin,
  Scale,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { MasterEntityWithCount } from '../../../types/api';
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS } from '../../../types/api';

interface EntityMergeModalProps {
  isOpen: boolean;
  entity1: MasterEntityWithCount | null;
  entity2: MasterEntityWithCount | null;
  allEntities: MasterEntityWithCount[];
  onClose: () => void;
  onMerge: (sourceIds: string[], targetId: string, canonicalName?: string) => Promise<void>;
}

// Entity type icons
const ENTITY_TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  PERSON: Users,
  ORGANIZATION: Building2,
  LOCATION: MapPin,
  JURISDICTION: Scale,
};

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
 * Modal for merging two or more master entities
 */
export function EntityMergeModal({
  isOpen,
  entity1,
  entity2,
  allEntities,
  onClose,
  onMerge,
}: EntityMergeModalProps) {
  // Selected entities for merge
  const [sourceEntities, setSourceEntities] = useState<MasterEntityWithCount[]>([]);
  const [targetEntity, setTargetEntity] = useState<MasterEntityWithCount | null>(null);
  const [customName, setCustomName] = useState('');
  const [useCustomName, setUseCustomName] = useState(false);
  const [merging, setMerging] = useState(false);
  const [showEntityPicker, setShowEntityPicker] = useState(false);

  // Initialize with provided entities
  useEffect(() => {
    if (isOpen && entity1 && entity2) {
      setSourceEntities([entity1]);
      setTargetEntity(entity2);
      setCustomName(entity2.canonicalName);
      setUseCustomName(false);
    }
  }, [isOpen, entity1, entity2]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSourceEntities([]);
      setTargetEntity(null);
      setCustomName('');
      setUseCustomName(false);
      setShowEntityPicker(false);
    }
  }, [isOpen]);

  // Handle swapping source and target
  const handleSwap = () => {
    if (sourceEntities.length === 1 && targetEntity) {
      const newTarget = sourceEntities[0];
      const newSource = targetEntity;
      setSourceEntities([newSource]);
      setTargetEntity(newTarget);
      setCustomName(newTarget.canonicalName);
    }
  };

  // Add additional source entity
  const handleAddSource = (entity: MasterEntityWithCount) => {
    if (!sourceEntities.find((e) => e.id === entity.id) && entity.id !== targetEntity?.id) {
      setSourceEntities([...sourceEntities, entity]);
    }
    setShowEntityPicker(false);
  };

  // Remove source entity
  const handleRemoveSource = (entityId: string) => {
    setSourceEntities(sourceEntities.filter((e) => e.id !== entityId));
  };

  // Change target entity
  const handleChangeTarget = (entity: MasterEntityWithCount) => {
    // Move current target to sources if exists
    if (targetEntity) {
      setSourceEntities([...sourceEntities.filter((e) => e.id !== entity.id), targetEntity]);
    } else {
      setSourceEntities(sourceEntities.filter((e) => e.id !== entity.id));
    }
    setTargetEntity(entity);
    setCustomName(entity.canonicalName);
  };

  // Handle merge
  const handleMerge = async () => {
    if (!targetEntity || sourceEntities.length === 0) return;

    setMerging(true);
    try {
      await onMerge(
        sourceEntities.map((e) => e.id),
        targetEntity.id,
        useCustomName && customName !== targetEntity.canonicalName ? customName : undefined
      );
      onClose();
    } catch {
      // Error handling done in parent
    } finally {
      setMerging(false);
    }
  };

  // Available entities for picker (same type, not already selected)
  const availableEntities = targetEntity
    ? allEntities.filter(
        (e) =>
          e.entityType === targetEntity.entityType &&
          e.id !== targetEntity.id &&
          !sourceEntities.find((s) => s.id === e.id)
      )
    : [];

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content entity-merge-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="merge-header-content">
            <Merge size={20} />
            <h2>Merge Entities</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          <p className="merge-description">
            Merge multiple entities into one. All document mentions from source entities will be
            linked to the target entity, and source entities will be deleted.
          </p>

          {/* Source entities section */}
          <div className="merge-section">
            <h3>Source Entities (will be deleted)</h3>
            <div className="merge-entities-list">
              {sourceEntities.map((entity) => (
                <div key={entity.id} className="merge-entity-card source">
                  <div className="merge-entity-info">
                    <EntityIcon entityType={entity.entityType} size={16} />
                    <span className="entity-name">{entity.canonicalName}</span>
                    <span className="doc-count">
                      <FileText size={12} />
                      {entity.documentCount}
                    </span>
                  </div>
                  <div className="merge-entity-actions">
                    <button
                      className="button small secondary"
                      onClick={() => handleChangeTarget(entity)}
                      title="Make this the target"
                    >
                      Use as target
                    </button>
                    {sourceEntities.length > 1 && (
                      <button
                        className="button small danger"
                        onClick={() => handleRemoveSource(entity.id)}
                        title="Remove from merge"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add more sources button */}
              {availableEntities.length > 0 && (
                <div className="add-source-section">
                  <button
                    className="button small secondary"
                    onClick={() => setShowEntityPicker(!showEntityPicker)}
                  >
                    {showEntityPicker ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Add more entities
                  </button>

                  {showEntityPicker && (
                    <div className="entity-picker">
                      {availableEntities.slice(0, 10).map((entity) => (
                        <div
                          key={entity.id}
                          className="entity-picker-item"
                          onClick={() => handleAddSource(entity)}
                        >
                          <EntityIcon entityType={entity.entityType} size={14} />
                          <span>{entity.canonicalName}</span>
                          <span className="doc-count">({entity.documentCount})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Arrow indicator */}
          <div className="merge-arrow">
            <ArrowRight size={24} />
            <span>will merge into</span>
          </div>

          {/* Target entity section */}
          <div className="merge-section">
            <h3>Target Entity (will keep)</h3>
            {targetEntity && (
              <div className="merge-entity-card target">
                <div className="merge-entity-info">
                  <EntityIcon entityType={targetEntity.entityType} size={16} />
                  <span className="entity-name">{targetEntity.canonicalName}</span>
                  <span
                    className="entity-type-badge"
                    style={{ backgroundColor: ENTITY_TYPE_COLORS[targetEntity.entityType] }}
                  >
                    {ENTITY_TYPE_LABELS[targetEntity.entityType]}
                  </span>
                  <span className="doc-count">
                    <FileText size={12} />
                    {targetEntity.documentCount}
                  </span>
                </div>
                {sourceEntities.length === 1 && (
                  <button className="button small secondary" onClick={handleSwap}>
                    Swap
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Custom name option */}
          <div className="merge-section">
            <label className="custom-name-toggle">
              <input
                type="checkbox"
                checked={useCustomName}
                onChange={(e) => setUseCustomName(e.target.checked)}
              />
              Use a different name for the merged entity
            </label>
            {useCustomName && (
              <input
                type="text"
                className="custom-name-input"
                placeholder="Enter new canonical name..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            )}
          </div>

          {/* Summary */}
          <div className="merge-summary">
            <p>
              <strong>After merge:</strong> {sourceEntities.length} source entit
              {sourceEntities.length === 1 ? 'y' : 'ies'} will be deleted. All{' '}
              {sourceEntities.reduce((sum, e) => sum + e.documentCount, 0)} document mentions will
              be linked to "{useCustomName && customName ? customName : targetEntity?.canonicalName}
              ".
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="button secondary" onClick={onClose} disabled={merging}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleMerge}
            disabled={
              merging ||
              !targetEntity ||
              sourceEntities.length === 0 ||
              (useCustomName && !customName.trim())
            }
          >
            <Merge size={14} />
            {merging ? 'Merging...' : `Merge ${sourceEntities.length + 1} Entities`}
          </button>
        </div>
      </div>
    </div>
  );
}
