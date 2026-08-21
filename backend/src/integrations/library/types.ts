/**
 * Shared value types for the knowledge library. These mirror the Prisma enums
 * of the same name (LibraryNodeType, CoverageStatus, LibraryEdgeType) so the
 * writer service and markdown renderers share one vocabulary.
 */

/** What a LibraryNode represents. */
export type LibraryNodeType =
  | 'RISK_CATEGORY' // Tier-1 slot (pre-seeded); carries a coverage status
  | 'PROVISION' // evidence: a clause instance in one document
  | 'RISK' // evidence: an identified risk
  | 'OBLIGATION' // evidence: a covenant / date / milestone
  | 'ENTITY' // cross-cutting: a canonical company/person/jurisdiction
  | 'SOURCE'; // cross-cutting: one ingested document (provenance hub)

/**
 * Coverage status of a RISK_CATEGORY node — the diligence-tracker semantics.
 * Authoritatively recomputed by reconciliation (Phase 2); set opportunistically
 * at file-time in Phase 1.
 */
export type CoverageStatus =
  | 'OPEN' // no evidence found yet — the gap (default at seed time)
  | 'COVERED' // evidence found, on-playbook / no red flag
  | 'FLAGGED' // evidence found, deviates from playbook or is HIGH risk
  | 'THIN' // some evidence but likely incomplete
  | 'NA'; // not applicable, or delegated to another adviser

/** How two LibraryNodes relate. */
export type LibraryEdgeType =
  | 'EVIDENCES' // provision/risk/obligation → risk category
  | 'SOURCED_FROM' // any evidence node → source node
  | 'MENTIONS' // evidence node → entity node
  | 'PEER_OF' // evidence node ↔ same-clause-type evidence in another doc
  | 'RELATES_TO'; // generic cross-link

export const RISK_TO_STATUS = (
  riskLevel: string | null | undefined
): CoverageStatus =>
  riskLevel === 'HIGH' ? 'FLAGGED' : 'COVERED';
