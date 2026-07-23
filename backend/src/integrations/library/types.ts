/**
 * Shared value types for the knowledge library. These mirror the Prisma enums
 * of the same name (LibraryNodeType, CoverageStatus, LibraryEdgeType) so the
 * writer service and markdown renderers share one vocabulary.
 */

/** What a LibraryNode represents. */
export type LibraryNodeType =
  | 'CHECKLIST_ITEM' // Tier-2 slot (pre-seeded); carries a coverage status
  | 'PROVISION' // Tier-3 evidence: a CUAD clause instance in one document
  | 'RISK' // Tier-3 evidence: an identified risk
  | 'OBLIGATION' // Tier-3 evidence: a covenant / date / milestone
  | 'ENTITY' // cross-cutting: a canonical company/person/jurisdiction
  | 'SOURCE'; // cross-cutting: one ingested document (provenance hub)

/**
 * Coverage status of a CHECKLIST_ITEM node — the diligence-tracker semantics.
 * Authoritatively recomputed by reconciliation (Phase 2); set opportunistically
 * at file-time in Phase 1.
 */
export type CoverageStatus =
  | 'OPEN' // no evidence found yet — the gap (default at seed time)
  | 'COVERED' // evidence found, on-playbook / no red flag
  | 'FLAGGED' // evidence found, deviates from playbook or is HIGH risk
  | 'THIN' // some evidence but likely incomplete
  | 'NA'; // not applicable to this deal

/** How two LibraryNodes relate. */
export type LibraryEdgeType =
  | 'EVIDENCES' // provision/risk/obligation → checklist item
  | 'SOURCED_FROM' // any evidence node → source node
  | 'MENTIONS' // evidence node → entity node
  | 'PEER_OF' // evidence node ↔ same-clause-type evidence in another doc
  | 'RELATES_TO'; // generic cross-link

export const RISK_TO_STATUS = (
  riskLevel: string | null | undefined
): CoverageStatus =>
  riskLevel === 'HIGH' ? 'FLAGGED' : 'COVERED';
