import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  X,
  Shield,
  ShieldCheck,
  Lock,
  Ban,
  RefreshCw,
  ArrowRight,
  Scale,
  DollarSign,
  CheckCircle,
  Lightbulb,
  AlertTriangle,
  FileText,
  FileCheck,
  GitBranch,
  AlertOctagon,
  MoreHorizontal,
  Eye,
  EyeOff,
  Loader,
  Info,
} from 'lucide-react';
import type { DocumentClause, ClauseType, RiskLevel } from '../../../types/api';
import { CLAUSE_TYPE_COLORS, CLAUSE_TYPE_LABELS, RISK_LEVEL_COLORS, RISK_LEVEL_LABELS } from '../../../types/api';

interface ClausesPanelProps {
  clauses: DocumentClause[];
  loading: boolean;
  error: string | null;
  highlightEnabled: boolean;
  highlightedTypes: Set<ClauseType>;
  selectedClause: DocumentClause | null;
  onToggleHighlight: () => void;
  onToggleTypeHighlight: (type: ClauseType) => void;
  onSelectClause: (clause: DocumentClause | null) => void;
  onNavigateToPage?: (pageNumber: number) => void;
}

// Icons for each clause type
const CLAUSE_TYPE_ICONS: Record<ClauseType, React.ElementType> = {
  TERMINATION: X,
  LIABILITY: Shield,
  INDEMNIFICATION: ShieldCheck,
  CONFIDENTIALITY: Lock,
  NON_COMPETE: Ban,
  CHANGE_OF_CONTROL: RefreshCw,
  ASSIGNMENT: ArrowRight,
  GOVERNING_LAW: Scale,
  DISPUTE_RESOLUTION: Scale,
  PAYMENT_TERMS: DollarSign,
  WARRANTY: CheckCircle,
  INTELLECTUAL_PROPERTY: Lightbulb,
  FORCE_MAJEURE: AlertTriangle,
  REPRESENTATIONS: FileText,
  COVENANTS: FileCheck,
  CONDITIONS_PRECEDENT: GitBranch,
  MATERIAL_ADVERSE_CHANGE: AlertOctagon,
  OTHER: MoreHorizontal,
};

/**
 * Format confidence score as percentage
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Truncate text to a maximum length
 */
function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Group clauses by type
 */
function groupClausesByType(clauses: DocumentClause[]): Map<ClauseType, DocumentClause[]> {
  const grouped = new Map<ClauseType, DocumentClause[]>();

  for (const clause of clauses) {
    const type = clause.clauseType || 'OTHER';
    const existing = grouped.get(type as ClauseType) || [];
    existing.push(clause);
    grouped.set(type as ClauseType, existing);
  }

  // Sort clauses within each group by page number, then by start offset
  for (const [type, typeClauses] of grouped) {
    typeClauses.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) {
        return (a.pageNumber || 0) - (b.pageNumber || 0);
      }
      return (a.startOffset || 0) - (b.startOffset || 0);
    });
    grouped.set(type, typeClauses);
  }

  return grouped;
}

/**
 * Clauses Panel component for document viewer
 * Displays detected clauses grouped by type with risk indicators
 */
export function ClausesPanel({
  clauses,
  loading,
  error,
  highlightEnabled,
  highlightedTypes,
  selectedClause,
  onToggleHighlight,
  onToggleTypeHighlight,
  onSelectClause,
  onNavigateToPage,
}: ClausesPanelProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<ClauseType>>(new Set());

  // Group clauses by type
  const groupedClauses = useMemo(() => groupClausesByType(clauses), [clauses]);

  // Count risk-flagged clauses
  const riskFlaggedCount = clauses.filter((c) => c.riskLevel).length;

  // Toggle type expansion
  const toggleTypeExpansion = (type: ClauseType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Handle clause click
  const handleClauseClick = (clause: DocumentClause) => {
    onSelectClause(clause);
    if (clause.pageNumber && onNavigateToPage) {
      onNavigateToPage(clause.pageNumber);
    }
  };

  if (loading) {
    return (
      <div className="clauses-panel">
        <div className="clauses-panel-loading">
          <Loader size={20} className="spinning" />
          <span>Loading clauses...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="clauses-panel">
        <div className="clauses-panel-error">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (clauses.length === 0) {
    return (
      <div className="clauses-panel">
        <div className="clauses-panel-empty">
          <Info size={20} />
          <span>No clauses detected</span>
          <p>Clauses will appear here after document processing completes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="clauses-panel">
      {/* Header with highlight toggle */}
      <div className="clauses-panel-header">
        <h4>Clauses ({clauses.length})</h4>
        <button
          className={`icon-button small ${highlightEnabled ? 'active' : ''}`}
          onClick={onToggleHighlight}
          title={highlightEnabled ? 'Hide highlights' : 'Show highlights'}
        >
          {highlightEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>

      {/* Risk warning */}
      {riskFlaggedCount > 0 && (
        <div className="clauses-risk-warning">
          <AlertTriangle size={14} />
          <span>{riskFlaggedCount} risk-flagged clause{riskFlaggedCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Clause type legend */}
      <div className="clauses-legend">
        {Array.from(groupedClauses.keys()).map((type) => {
          const Icon = CLAUSE_TYPE_ICONS[type];
          const isHighlighted = highlightedTypes.has(type);
          const count = groupedClauses.get(type)?.length || 0;
          const hasRisk = groupedClauses.get(type)?.some((c) => c.riskLevel);

          return (
            <button
              key={type}
              className={`clause-legend-item ${isHighlighted ? 'active' : ''} ${hasRisk ? 'has-risk' : ''}`}
              onClick={() => onToggleTypeHighlight(type)}
              title={`${CLAUSE_TYPE_LABELS[type]} (${count}) - Click to toggle`}
              style={{
                '--clause-color': CLAUSE_TYPE_COLORS[type],
              } as React.CSSProperties}
            >
              <Icon size={12} />
              <span>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Clause groups */}
      <div className="clauses-list">
        {Array.from(groupedClauses.entries()).map(([type, typeClauses]) => {
          const Icon = CLAUSE_TYPE_ICONS[type];
          const isExpanded = expandedTypes.has(type);
          const isHighlighted = highlightedTypes.has(type);
          const hasRiskClauses = typeClauses.some((c) => c.riskLevel);

          return (
            <div
              key={type}
              className={`clause-group ${isHighlighted ? 'highlighted' : ''} ${hasRiskClauses ? 'has-risk' : ''}`}
              style={{
                '--clause-color': CLAUSE_TYPE_COLORS[type],
              } as React.CSSProperties}
            >
              {/* Group header */}
              <button
                className="clause-group-header"
                onClick={() => toggleTypeExpansion(type)}
              >
                <div className="clause-group-icon">
                  <Icon size={14} />
                </div>
                <span className="clause-group-label">
                  {CLAUSE_TYPE_LABELS[type]}
                </span>
                <span className="clause-group-count">{typeClauses.length}</span>
                {hasRiskClauses && (
                  <AlertTriangle size={12} className="clause-group-risk-icon" />
                )}
                <span className="clause-group-chevron">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {/* Group items */}
              {isExpanded && (
                <div className="clause-group-items">
                  {typeClauses.map((clause) => (
                    <button
                      key={clause.id}
                      className={`clause-item ${
                        selectedClause?.id === clause.id ? 'selected' : ''
                      } ${clause.riskLevel ? 'has-risk' : ''}`}
                      onClick={() => handleClauseClick(clause)}
                    >
                      <div className="clause-item-content">
                        {clause.title && (
                          <span className="clause-item-title">{clause.title}</span>
                        )}
                        <span className="clause-item-text">
                          {truncateText(clause.content, 120)}
                        </span>
                      </div>
                      <div className="clause-item-meta">
                        {clause.pageNumber && (
                          <span className="clause-item-page">p.{clause.pageNumber}</span>
                        )}
                        {clause.riskLevel && (
                          <span
                            className="clause-item-risk"
                            style={{
                              backgroundColor: RISK_LEVEL_COLORS[clause.riskLevel as RiskLevel],
                            }}
                            title={`${RISK_LEVEL_LABELS[clause.riskLevel as RiskLevel]}`}
                          >
                            <AlertTriangle size={10} />
                          </span>
                        )}
                        <span
                          className={`clause-item-confidence ${
                            clause.confidence < 0.8 ? 'low' : ''
                          }`}
                          title={`Confidence: ${formatConfidence(clause.confidence)}`}
                        >
                          {formatConfidence(clause.confidence)}
                        </span>
                        {clause.isVerified && (
                          <span title="Verified">
                            <CheckCircle size={12} className="verified-icon" />
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
