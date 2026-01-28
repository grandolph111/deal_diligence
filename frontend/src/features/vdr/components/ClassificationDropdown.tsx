import { useState, useCallback } from 'react';
import { ChevronDown, Tag, RefreshCw, Loader, Check } from 'lucide-react';
import type { DocumentType, RiskLevel, Document } from '../../../types/api';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_COLORS, RISK_LEVEL_LABELS, RISK_LEVEL_COLORS } from '../../../types/api';
import { classificationService } from '../../../api';

interface ClassificationDropdownProps {
  projectId: string;
  document: Document;
  onClassificationChange?: (documentType: DocumentType | null, riskLevel: RiskLevel | null) => void;
  canEdit?: boolean;
}

const DOCUMENT_TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as Array<[DocumentType, string]>;
const RISK_LEVELS = Object.entries(RISK_LEVEL_LABELS) as Array<[RiskLevel, string]>;

/**
 * Classification dropdown for manual document type selection
 */
export function ClassificationDropdown({
  projectId,
  document,
  onClassificationChange,
  canEdit = true,
}: ClassificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType | null>(
    document.documentType as DocumentType | null
  );
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel | null>(
    document.riskLevel as RiskLevel | null
  );
  const [showRiskSelector, setShowRiskSelector] = useState(false);
  const [success, setSuccess] = useState(false);

  // Handle document type selection
  const handleTypeSelect = useCallback(async (type: DocumentType) => {
    if (loading) return;

    setLoading(true);
    setSuccess(false);

    try {
      await classificationService.classifyDocument(projectId, document.id, {
        documentType: type,
        riskLevel: selectedRisk || undefined,
      });
      setSelectedType(type);
      setIsOpen(false);
      setSuccess(true);
      onClassificationChange?.(type, selectedRisk);
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to classify document:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, document.id, selectedRisk, loading, onClassificationChange]);

  // Handle risk level selection
  const handleRiskSelect = useCallback(async (risk: RiskLevel) => {
    if (loading || !selectedType) return;

    setLoading(true);
    setSuccess(false);

    try {
      await classificationService.classifyDocument(projectId, document.id, {
        documentType: selectedType,
        riskLevel: risk,
      });
      setSelectedRisk(risk);
      setShowRiskSelector(false);
      setSuccess(true);
      onClassificationChange?.(selectedType, risk);
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to set risk level:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, document.id, selectedType, loading, onClassificationChange]);

  // Handle AI classification
  const handleAIClassify = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    setSuccess(false);

    try {
      const result = await classificationService.classifyViaAI(projectId, document.id);
      setSelectedType(result.documentType);
      setSelectedRisk(result.riskLevel);
      setIsOpen(false);
      setSuccess(true);
      onClassificationChange?.(result.documentType, result.riskLevel);
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to AI classify document:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, document.id, loading, onClassificationChange]);

  const currentTypeLabel = selectedType ? DOCUMENT_TYPE_LABELS[selectedType] : 'Unclassified';
  const currentTypeColor = selectedType ? DOCUMENT_TYPE_COLORS[selectedType] : '#6b7280';
  const currentRiskLabel = selectedRisk ? RISK_LEVEL_LABELS[selectedRisk] : null;
  const currentRiskColor = selectedRisk ? RISK_LEVEL_COLORS[selectedRisk] : null;

  return (
    <div className="classification-dropdown">
      {/* Document Type Selector */}
      <div className="classification-section">
        <label className="classification-label">Document Type</label>
        <div className="classification-selector">
          <button
            type="button"
            className={`classification-button ${isOpen ? 'active' : ''}`}
            onClick={() => canEdit && setIsOpen(!isOpen)}
            disabled={!canEdit || loading}
          >
            <span
              className="classification-badge"
              style={{ backgroundColor: currentTypeColor }}
            >
              <Tag size={12} />
              {currentTypeLabel}
            </span>
            {canEdit && (
              <span className="classification-icons">
                {loading && <Loader size={14} className="spinning" />}
                {success && <Check size={14} className="success-icon" />}
                {!loading && !success && <ChevronDown size={14} />}
              </span>
            )}
          </button>

          {isOpen && canEdit && (
            <div className="classification-menu">
              <div className="classification-menu-header">
                <span>Select document type</span>
                <button
                  type="button"
                  className="ai-classify-button"
                  onClick={handleAIClassify}
                  disabled={loading}
                  title="Auto-classify with AI"
                >
                  <RefreshCw size={14} />
                  AI Classify
                </button>
              </div>
              <div className="classification-options">
                {DOCUMENT_TYPES.map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    className={`classification-option ${selectedType === type ? 'selected' : ''}`}
                    onClick={() => handleTypeSelect(type)}
                    disabled={loading}
                  >
                    <span
                      className="option-dot"
                      style={{ backgroundColor: DOCUMENT_TYPE_COLORS[type] }}
                    />
                    {label}
                    {selectedType === type && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Risk Level Selector (only shown if document has type) */}
      {selectedType && (
        <div className="classification-section">
          <label className="classification-label">Risk Level</label>
          <div className="classification-selector">
            <button
              type="button"
              className={`classification-button ${showRiskSelector ? 'active' : ''}`}
              onClick={() => canEdit && setShowRiskSelector(!showRiskSelector)}
              disabled={!canEdit || loading}
            >
              {currentRiskLabel ? (
                <span
                  className="classification-badge small"
                  style={{ backgroundColor: currentRiskColor || undefined }}
                >
                  {currentRiskLabel}
                </span>
              ) : (
                <span className="classification-placeholder">Not set</span>
              )}
              {canEdit && !loading && <ChevronDown size={14} />}
            </button>

            {showRiskSelector && canEdit && (
              <div className="classification-menu">
                <div className="classification-options">
                  {RISK_LEVELS.map(([level, label]) => (
                    <button
                      key={level}
                      type="button"
                      className={`classification-option ${selectedRisk === level ? 'selected' : ''}`}
                      onClick={() => handleRiskSelect(level)}
                      disabled={loading}
                    >
                      <span
                        className="option-dot"
                        style={{ backgroundColor: RISK_LEVEL_COLORS[level] }}
                      />
                      {label}
                      {selectedRisk === level && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
