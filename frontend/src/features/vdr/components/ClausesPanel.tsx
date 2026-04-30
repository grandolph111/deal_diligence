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
  Calendar,
  Eye,
  EyeOff,
  Info,
  Copy,
  ExternalLink,
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

// Icons for every clause type. Record<ClauseType, …> enforces exhaustiveness
// at compile time — adding a type to CLAUSE_TYPES in types/api.ts without an
// icon here is a TypeScript error.
const CLAUSE_TYPE_ICONS: Record<ClauseType, React.ElementType> = {
  AGREEMENT_DATE: Calendar,
  EFFECTIVE_DATE: Calendar,
  EXPIRATION_DATE: Calendar,
  CAP_ON_LIABILITY: Shield,
  UNCAPPED_LIABILITY: AlertOctagon,
  INDEMNIFICATION: ShieldCheck,
  REPRESENTATIONS_AND_WARRANTIES: FileText,
  CHANGE_OF_CONTROL: RefreshCw,
  TERMINATION_FOR_CONVENIENCE: X,
  MATERIAL_ADVERSE_CHANGE: AlertOctagon,
  CONDITIONS_PRECEDENT: GitBranch,
  COVENANTS: FileCheck,
  COVENANT_NOT_TO_SUE: FileCheck,
  EXCLUSIVITY: Lock,
  NON_COMPETE: Ban,
  NON_DISPARAGEMENT: Ban,
  NO_SOLICIT_CUSTOMERS: Ban,
  NO_SOLICIT_EMPLOYEES: Ban,
  VOLUME_RESTRICTION: Ban,
  PRICE_RESTRICTIONS: DollarSign,
  COMPETITIVE_RESTRICTION_EXCEPTION: Ban,
  ANTI_ASSIGNMENT: ArrowRight,
  IP_OWNERSHIP_ASSIGNMENT: Lightbulb,
  JOINT_IP_OWNERSHIP: Lightbulb,
  LICENSE_GRANT: Lightbulb,
  IRREVOCABLE_OR_PERPETUAL_LICENSE: Lightbulb,
  NON_TRANSFERABLE_LICENSE: Lightbulb,
  UNLIMITED_LICENSE: Lightbulb,
  SOURCE_CODE_ESCROW: Lightbulb,
  MINIMUM_COMMITMENT: DollarSign,
  REVENUE_OR_PROFIT_SHARING: DollarSign,
  MOST_FAVORED_NATION: Lock,
  ROFR_ROFO_ROFN: ArrowRight,
  THIRD_PARTY_BENEFICIARY: ArrowRight,
  PAYMENT_TERMS: DollarSign,
  LIQUIDATED_DAMAGES: DollarSign,
  WARRANTY_DURATION: CheckCircle,
  RENEWAL_TERM: RefreshCw,
  NOTICE_PERIOD_TO_TERMINATE_RENEWAL: RefreshCw,
  POST_TERMINATION_SERVICES: RefreshCw,
  AUDIT_RIGHTS: CheckCircle,
  INSURANCE: ShieldCheck,
  CONFIDENTIALITY: Lock,
  GOVERNING_LAW: Scale,
  DISPUTE_RESOLUTION: Scale,
  FORCE_MAJEURE: AlertTriangle,
  ASSIGNMENT: ArrowRight,
  INTELLECTUAL_PROPERTY: Lightbulb,
  LIABILITY: Shield,
  TERMINATION: X,
  WARRANTY: CheckCircle,
  REPRESENTATIONS: FileText,
  OTHER: MoreHorizontal,
};

// Safety net for legacy DB rows with unknown clause types — renders the
// neutral Other icon instead of crashing. Should rarely fire in practice.
const getClauseIcon = (type: string): React.ElementType =>
  CLAUSE_TYPE_ICONS[type as ClauseType] ?? MoreHorizontal;

const getClauseLabel = (type: string): string =>
  CLAUSE_TYPE_LABELS[type as ClauseType] ??
  type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const getClauseColor = (type: string): string =>
  CLAUSE_TYPE_COLORS[type as ClauseType] ?? '#6b7280';

/**
 * Format confidence score as percentage
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
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
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton-row">
              <span className="skeleton skeleton-text" style={{ width: '40%' }} />
              <span className="skeleton skeleton-text" style={{ width: '20%', marginLeft: 'auto' }} />
            </div>
          ))}
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
          const Icon = getClauseIcon(type);
          const isHighlighted = highlightedTypes.has(type);
          const count = groupedClauses.get(type)?.length || 0;
          const hasRisk = groupedClauses.get(type)?.some((c) => c.riskLevel);

          return (
            <button
              key={type}
              className={`clause-legend-item ${isHighlighted ? 'active' : ''} ${hasRisk ? 'has-risk' : ''}`}
              onClick={() => onToggleTypeHighlight(type)}
              title={`${getClauseLabel(type)} (${count}) - Click to toggle`}
              style={{
                '--clause-color': getClauseColor(type),
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
          const Icon = getClauseIcon(type);
          const isExpanded = expandedTypes.has(type);
          const isHighlighted = highlightedTypes.has(type);
          const hasRiskClauses = typeClauses.some((c) => c.riskLevel);

          return (
            <div
              key={type}
              className={`clause-group ${isHighlighted ? 'highlighted' : ''} ${hasRiskClauses ? 'has-risk' : ''}`}
              style={{
                '--clause-color': getClauseColor(type),
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
                  {getClauseLabel(type)}
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
                    <ClauseItem
                      key={clause.id}
                      clause={clause}
                      isSelected={selectedClause?.id === clause.id}
                      onOpen={() => handleClauseClick(clause)}
                    />
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

function ClauseItem({
  clause,
  isSelected,
  onOpen,
}: {
  clause: DocumentClause;
  isSelected: boolean;
  onOpen: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(clause.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; fall through
    }
  };

  return (
    <div
      className={`clause-item ${isSelected ? 'selected' : ''} ${
        clause.riskLevel ? 'has-risk' : ''
      }`}
    >
      <div className="clause-item-content">
        {clause.title && (
          <span className="clause-item-title">{clause.title}</span>
        )}
        <span className="clause-item-text" style={{ userSelect: 'text' }}>
          {clause.content}
        </span>
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
      </div>
      <div className="clause-item-actions">
        <button
          type="button"
          className="clause-item-action"
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy clause text'}
        >
          {copied ? (
            <CheckCircle size={14} style={{ color: '#046c4e' }} />
          ) : (
            <Copy size={14} />
          )}
        </button>
        <button
          type="button"
          className="clause-item-action"
          onClick={onOpen}
          title="Jump to page & open details"
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}
