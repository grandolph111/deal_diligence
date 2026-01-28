import {
  X,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Calendar,
} from 'lucide-react';
import type { DocumentClause, ClauseType, RiskLevel } from '../../../types/api';
import { CLAUSE_TYPE_LABELS, CLAUSE_TYPE_COLORS, RISK_LEVEL_LABELS, RISK_LEVEL_COLORS } from '../../../types/api';

interface ClauseDetailsModalProps {
  clause: DocumentClause;
  onClose: () => void;
  onNavigateToPage?: (pageNumber: number) => void;
  onVerify?: (note?: string) => void;
  onReject?: (note?: string) => void;
}

/**
 * Format confidence score as percentage
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Format date to locale string
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Modal for displaying clause details
 */
export function ClauseDetailsModal({
  clause,
  onClose,
  onNavigateToPage,
  onVerify,
  onReject,
}: ClauseDetailsModalProps) {
  const clauseType = clause.clauseType as ClauseType | null;
  const riskLevel = clause.riskLevel as RiskLevel | null;

  const handleNavigateToPage = () => {
    if (clause.pageNumber && onNavigateToPage) {
      onNavigateToPage(clause.pageNumber);
      onClose();
    }
  };

  const handleVerify = () => {
    if (onVerify) {
      onVerify();
    }
  };

  const handleReject = () => {
    if (onReject) {
      onReject();
    }
  };

  return (
    <div className="clause-details-modal-overlay" onClick={onClose}>
      <div className="clause-details-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="clause-details-header">
          <div className="clause-details-title">
            <FileText size={18} />
            <span>Clause Details</span>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="clause-details-content">
          {/* Clause type badge */}
          <div className="clause-details-type">
            {clauseType && (
              <span
                className="clause-type-badge"
                style={{
                  backgroundColor: CLAUSE_TYPE_COLORS[clauseType],
                }}
              >
                {CLAUSE_TYPE_LABELS[clauseType]}
              </span>
            )}
            {riskLevel && (
              <span
                className="clause-risk-badge"
                style={{
                  backgroundColor: RISK_LEVEL_COLORS[riskLevel],
                }}
              >
                <AlertTriangle size={12} />
                {RISK_LEVEL_LABELS[riskLevel]}
              </span>
            )}
          </div>

          {/* Title (if present) */}
          {clause.title && (
            <div className="clause-details-section">
              <label>Title</label>
              <p className="clause-title-text">{clause.title}</p>
            </div>
          )}

          {/* Content */}
          <div className="clause-details-section">
            <label>Content</label>
            <div className="clause-content-text">{clause.content}</div>
          </div>

          {/* Metadata grid */}
          <div className="clause-details-meta-grid">
            {/* Page number */}
            {clause.pageNumber && (
              <div className="clause-meta-item">
                <label>Page</label>
                <span>{clause.pageNumber}</span>
              </div>
            )}

            {/* Confidence */}
            <div className="clause-meta-item">
              <label>Confidence</label>
              <span className={clause.confidence < 0.8 ? 'low-confidence' : ''}>
                {formatConfidence(clause.confidence)}
              </span>
            </div>

            {/* Source */}
            <div className="clause-meta-item">
              <label>Source</label>
              <span className="clause-source-badge">
                {clause.source === 'berrydb' ? 'AI Detected' : 'Manual'}
              </span>
            </div>

            {/* Position (if available) */}
            {clause.startOffset !== null && clause.endOffset !== null && (
              <div className="clause-meta-item">
                <label>Position</label>
                <span>
                  {clause.startOffset} - {clause.endOffset}
                </span>
              </div>
            )}
          </div>

          {/* Verification status */}
          <div className="clause-details-section">
            <label>Status</label>
            <div className="clause-verification-status">
              {clause.isVerified && (
                <div className="status-verified">
                  <CheckCircle size={16} />
                  <span>Verified</span>
                  {clause.verifiedBy && (
                    <span className="status-by">
                      by {clause.verifiedBy.name || clause.verifiedBy.email}
                    </span>
                  )}
                  {clause.verifiedAt && (
                    <span className="status-date">
                      on {formatDate(clause.verifiedAt)}
                    </span>
                  )}
                </div>
              )}
              {clause.isRejected && (
                <div className="status-rejected">
                  <XCircle size={16} />
                  <span>Rejected</span>
                  {clause.rejectedBy && (
                    <span className="status-by">
                      by {clause.rejectedBy.name || clause.rejectedBy.email}
                    </span>
                  )}
                  {clause.rejectedAt && (
                    <span className="status-date">
                      on {formatDate(clause.rejectedAt)}
                    </span>
                  )}
                </div>
              )}
              {!clause.isVerified && !clause.isRejected && (
                <div className="status-pending">
                  <span className="status-dot pending" />
                  <span>Pending Review</span>
                </div>
              )}
            </div>

            {/* Verification/Rejection notes */}
            {clause.verificationNote && (
              <div className="clause-status-note">
                <label>Verification Note</label>
                <p>{clause.verificationNote}</p>
              </div>
            )}
            {clause.rejectionNote && (
              <div className="clause-status-note">
                <label>Rejection Note</label>
                <p>{clause.rejectionNote}</p>
              </div>
            )}
          </div>

          {/* Created date */}
          <div className="clause-details-section clause-dates">
            <div className="clause-date-item">
              <Calendar size={14} />
              <span>Detected {formatDate(clause.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="clause-details-actions">
          {clause.pageNumber && onNavigateToPage && (
            <button
              className="btn btn-secondary"
              onClick={handleNavigateToPage}
            >
              <ExternalLink size={16} />
              Go to Page {clause.pageNumber}
            </button>
          )}

          {/* Verification actions (if not already verified/rejected and handlers provided) */}
          {!clause.isVerified && !clause.isRejected && (onVerify || onReject) && (
            <div className="clause-verification-actions">
              {onVerify && (
                <button
                  className="btn btn-success"
                  onClick={handleVerify}
                  title="Mark this clause as correctly identified"
                >
                  <CheckCircle size={16} />
                  Verify
                </button>
              )}
              {onReject && (
                <button
                  className="btn btn-danger"
                  onClick={handleReject}
                  title="Mark this clause as incorrectly identified"
                >
                  <XCircle size={16} />
                  Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
