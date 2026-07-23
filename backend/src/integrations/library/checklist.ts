/**
 * Canonical buy-side M&A due-diligence checklist — the Table of Contents for
 * the per-project knowledge library.
 *
 * TIERS
 *   Tier 1  Workstream       (12 legal/diligence categories)
 *   Tier 2  Checklist item   (the diligence QUESTION — a pre-seeded slot with a
 *                             coverage status)
 *   Tier 3  Evidence nodes   (CUAD clause instances + risk/entity/date nodes,
 *                             filed UNDER an item — see library-writer.service)
 *
 * The checklist is the ToC the deal team navigates. CUAD clause types are NOT
 * the ToC — they are the reproducible evidence atom the extraction pipeline
 * emits, mapped here onto the item they answer via `cuadTypes`. `factFed` items
 * are answered by facts/entities/risks, not clauses (litigation, cap table,
 * environmental…) — CUAD can never populate them, which is exactly why the
 * checklist, not CUAD, is the spine.
 *
 * This module is pure config: no I/O, no Prisma. `CUAD_TYPE_TO_ITEM` and the
 * lookups are derived once at import.
 */

export interface Workstream {
  /** Stable slug used as the Tier-1 folder name, e.g. `01-corporate-org`. */
  id: string;
  /** 1-based display order (also the numeric folder prefix). */
  order: number;
  title: string;
}

export interface ChecklistItem {
  /** Globally-unique slug — used as the Tier-2 folder name and LibraryNode slug. */
  id: string;
  workstreamId: string;
  title: string;
  /** One-line description of the diligence question this item answers. */
  description: string;
  /** CUAD clause types whose instances file as evidence under this item. */
  cuadTypes: string[];
  /** True when answered by facts/entities/risks rather than contract clauses. */
  factFed: boolean;
}

export const WORKSTREAMS: Workstream[] = [
  { id: '01-corporate-org', order: 1, title: 'Corporate & Organizational' },
  { id: '02-financial', order: 2, title: 'Financial' },
  { id: '03-commercial-contracts', order: 3, title: 'Commercial Contracts' },
  { id: '04-intellectual-property', order: 4, title: 'Intellectual Property' },
  { id: '05-liability-risk', order: 5, title: 'Liability & Risk Allocation' },
  { id: '06-employment-benefits', order: 6, title: 'Employment & Benefits' },
  { id: '07-real-property', order: 7, title: 'Real Property' },
  { id: '08-regulatory-compliance', order: 8, title: 'Regulatory & Compliance' },
  { id: '09-data-privacy', order: 9, title: 'Data & Privacy' },
  { id: '10-litigation-disputes', order: 10, title: 'Litigation & Disputes' },
  { id: '11-tax', order: 11, title: 'Tax' },
  { id: '12-term-key-dates', order: 12, title: 'Term & Key Dates' },
  // Catch-all so a clause type with no mapping is still filed, never dropped.
  { id: '99-to-triage', order: 99, title: 'To Triage' },
];

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  // 01 — Corporate & Organizational
  { id: 'entity-formation', workstreamId: '01-corporate-org', title: 'Entity formation & good standing', description: 'Is the target validly formed and in good standing in each jurisdiction?', cuadTypes: [], factFed: true },
  { id: 'cap-table-ownership', workstreamId: '01-corporate-org', title: 'Cap table & ownership', description: 'Equity, options, warrants, convertibles — is ownership clean and fully accounted for?', cuadTypes: [], factFed: true },
  { id: 'subsidiaries-structure', workstreamId: '01-corporate-org', title: 'Subsidiaries & corporate structure', description: 'What entities exist beneath the target and how are they held?', cuadTypes: [], factFed: true },
  { id: 'governance-voting', workstreamId: '01-corporate-org', title: 'Governance & voting rights', description: 'Board composition, voting thresholds, shareholder/protective rights.', cuadTypes: [], factFed: true },
  { id: 'coc-assignment-triggers', workstreamId: '01-corporate-org', title: 'Change-of-control / assignment triggers', description: 'Which rights or obligations trigger on this deal via change-of-control or assignment consent?', cuadTypes: ['CHANGE_OF_CONTROL', 'ANTI_ASSIGNMENT'], factFed: false },
  { id: 'minority-third-party-rights', workstreamId: '01-corporate-org', title: 'Minority & third-party rights', description: 'Third-party beneficiary rights, ROFR/ROFO/ROFN that constrain the transaction.', cuadTypes: ['THIRD_PARTY_BENEFICIARY', 'ROFR_ROFO_ROFN'], factFed: false },

  // 02 — Financial
  { id: 'financial-statements-qoe', workstreamId: '02-financial', title: 'Financial statements & quality of earnings', description: 'Are the financials reliable and is reported earnings quality sound?', cuadTypes: [], factFed: true },
  { id: 'indebtedness-liens', workstreamId: '02-financial', title: 'Indebtedness & liens', description: 'Outstanding debt, security interests, and encumbrances on assets.', cuadTypes: [], factFed: true },
  { id: 'payment-terms', workstreamId: '02-financial', title: 'Payment terms', description: 'Price, payment timing, and mechanics across material agreements.', cuadTypes: ['PAYMENT_TERMS'], factFed: false },
  { id: 'liquidated-damages', workstreamId: '02-financial', title: 'Liquidated damages & penalties', description: 'Pre-agreed damages or penalty exposure on breach.', cuadTypes: ['LIQUIDATED_DAMAGES'], factFed: false },
  { id: 'revenue-profit-sharing', workstreamId: '02-financial', title: 'Revenue & profit sharing', description: 'Arrangements that share revenue or profit with counterparties.', cuadTypes: ['REVENUE_OR_PROFIT_SHARING'], factFed: false },

  // 03 — Commercial Contracts
  { id: 'material-customer-agreements', workstreamId: '03-commercial-contracts', title: 'Material customer agreements', description: 'Key revenue contracts and their durability through the transaction.', cuadTypes: [], factFed: true },
  { id: 'material-supplier-agreements', workstreamId: '03-commercial-contracts', title: 'Material supplier agreements', description: 'Critical supply/vendor dependencies and their terms.', cuadTypes: [], factFed: true },
  { id: 'exclusivity-mfn', workstreamId: '03-commercial-contracts', title: 'Exclusivity & MFN commitments', description: 'Exclusivity obligations and most-favored-nation entitlements.', cuadTypes: ['EXCLUSIVITY', 'MOST_FAVORED_NATION'], factFed: false },
  { id: 'minimum-volume-commitments', workstreamId: '03-commercial-contracts', title: 'Minimum & volume commitments', description: 'Minimum purchase/payment obligations and volume restrictions.', cuadTypes: ['MINIMUM_COMMITMENT', 'VOLUME_RESTRICTION'], factFed: false },
  { id: 'pricing-restrictions', workstreamId: '03-commercial-contracts', title: 'Pricing restrictions', description: 'Floors, ceilings, or MFN-tied pricing constraints.', cuadTypes: ['PRICE_RESTRICTIONS'], factFed: false },
  { id: 'termination-renewal-exposure', workstreamId: '03-commercial-contracts', title: 'Termination & renewal exposure', description: 'Convenience-termination rights, auto-renewal, and notice windows.', cuadTypes: ['TERMINATION_FOR_CONVENIENCE', 'RENEWAL_TERM', 'NOTICE_PERIOD_TO_TERMINATE_RENEWAL'], factFed: false },
  { id: 'post-termination-obligations', workstreamId: '03-commercial-contracts', title: 'Post-termination obligations', description: 'Services or duties that survive termination.', cuadTypes: ['POST_TERMINATION_SERVICES'], factFed: false },

  // 04 — Intellectual Property
  { id: 'ip-ownership-assignment', workstreamId: '04-intellectual-property', title: 'IP ownership & assignment', description: 'Who owns the IP; is assignment clean or jointly held?', cuadTypes: ['IP_OWNERSHIP_ASSIGNMENT', 'JOINT_IP_OWNERSHIP'], factFed: false },
  { id: 'licenses-in-out', workstreamId: '04-intellectual-property', title: 'Licenses (inbound & outbound)', description: 'License grants, and any perpetual/irrevocable/unlimited/non-transferable terms.', cuadTypes: ['LICENSE_GRANT', 'IRREVOCABLE_OR_PERPETUAL_LICENSE', 'NON_TRANSFERABLE_LICENSE', 'UNLIMITED_LICENSE'], factFed: false },
  { id: 'source-code-escrow', workstreamId: '04-intellectual-property', title: 'Source-code escrow', description: 'Software escrow arrangements and their release triggers.', cuadTypes: ['SOURCE_CODE_ESCROW'], factFed: false },
  { id: 'open-source-exposure', workstreamId: '04-intellectual-property', title: 'Open-source exposure', description: 'Copyleft/open-source usage that could encumber proprietary IP.', cuadTypes: [], factFed: true },
  { id: 'ip-litigation', workstreamId: '04-intellectual-property', title: 'IP litigation & infringement', description: 'Pending or threatened IP disputes and infringement risk.', cuadTypes: [], factFed: true },

  // 05 — Liability & Risk Allocation
  { id: 'liability-caps', workstreamId: '05-liability-risk', title: 'Liability caps', description: 'Aggregate liability caps and any uncapped carve-outs.', cuadTypes: ['CAP_ON_LIABILITY', 'UNCAPPED_LIABILITY'], factFed: false },
  { id: 'indemnification', workstreamId: '05-liability-risk', title: 'Indemnification', description: 'Indemnity scope, survival, baskets, and caps.', cuadTypes: ['INDEMNIFICATION'], factFed: false },
  { id: 'reps-warranties', workstreamId: '05-liability-risk', title: 'Representations & warranties', description: 'Affirmative statements of fact and how long they survive.', cuadTypes: ['REPRESENTATIONS_AND_WARRANTIES', 'WARRANTY_DURATION'], factFed: false },
  { id: 'insurance', workstreamId: '05-liability-risk', title: 'Insurance coverage', description: 'Required coverage and adequacy of insurance.', cuadTypes: ['INSURANCE'], factFed: false },

  // 06 — Employment & Benefits
  { id: 'key-employees-retention', workstreamId: '06-employment-benefits', title: 'Key employees & retention', description: 'Flight risk of key people and retention mechanics.', cuadTypes: [], factFed: true },
  { id: 'employment-agreements-comp', workstreamId: '06-employment-benefits', title: 'Employment agreements & compensation', description: 'Executive agreements, severance, and comp obligations.', cuadTypes: [], factFed: true },
  { id: 'restrictive-covenants', workstreamId: '06-employment-benefits', title: 'Restrictive covenants (non-compete / solicit)', description: 'Non-compete, non-solicit, non-disparagement, and their carve-outs.', cuadTypes: ['NON_COMPETE', 'NO_SOLICIT_EMPLOYEES', 'NO_SOLICIT_CUSTOMERS', 'NON_DISPARAGEMENT', 'COMPETITIVE_RESTRICTION_EXCEPTION'], factFed: false },
  { id: 'benefit-plans-erisa', workstreamId: '06-employment-benefits', title: 'Benefit plans & ERISA', description: 'Pension/benefit plan obligations and ERISA exposure.', cuadTypes: [], factFed: true },
  { id: 'labor-classification', workstreamId: '06-employment-benefits', title: 'Labor & worker classification exposure', description: 'Union matters and contractor/employee misclassification risk.', cuadTypes: [], factFed: true },

  // 07 — Real Property
  { id: 'owned-property', workstreamId: '07-real-property', title: 'Owned property', description: 'Owned real estate and title matters.', cuadTypes: [], factFed: true },
  { id: 'leases', workstreamId: '07-real-property', title: 'Leases (term / assignment / CoC)', description: 'Lease terms and whether they survive or trigger on the deal.', cuadTypes: [], factFed: true },
  { id: 'environmental', workstreamId: '07-real-property', title: 'Environmental', description: 'Environmental liabilities tied to property or operations.', cuadTypes: [], factFed: true },

  // 08 — Regulatory & Compliance
  { id: 'governing-law-jurisdiction', workstreamId: '08-regulatory-compliance', title: 'Governing law & jurisdiction', description: 'Governing law and dispute forum across material agreements.', cuadTypes: ['GOVERNING_LAW'], factFed: false },
  { id: 'licenses-permits', workstreamId: '08-regulatory-compliance', title: 'Licenses & permits', description: 'Regulatory licenses/permits required to operate.', cuadTypes: [], factFed: true },
  { id: 'audit-rights', workstreamId: '08-regulatory-compliance', title: 'Audit rights', description: 'Counterparty audit rights over books/records/compliance.', cuadTypes: ['AUDIT_RIGHTS'], factFed: false },
  { id: 'anti-corruption-sanctions', workstreamId: '08-regulatory-compliance', title: 'Anti-corruption, sanctions & export', description: 'FCPA/anti-bribery, sanctions, and export-control exposure.', cuadTypes: [], factFed: true },
  { id: 'antitrust-hsr', workstreamId: '08-regulatory-compliance', title: 'Antitrust / HSR', description: 'Merger-control and HSR filing considerations.', cuadTypes: [], factFed: true },

  // 09 — Data & Privacy
  { id: 'confidentiality-obligations', workstreamId: '09-data-privacy', title: 'Confidentiality obligations', description: 'Information-protection duties across agreements.', cuadTypes: ['CONFIDENTIALITY'], factFed: false },
  { id: 'data-protection-compliance', workstreamId: '09-data-privacy', title: 'Data-protection compliance', description: 'GDPR/CCPA and broader privacy-law posture.', cuadTypes: [], factFed: true },
  { id: 'security-incidents', workstreamId: '09-data-privacy', title: 'Security incidents', description: 'History of breaches and incident exposure.', cuadTypes: [], factFed: true },

  // 10 — Litigation & Disputes
  { id: 'pending-litigation', workstreamId: '10-litigation-disputes', title: 'Pending & threatened litigation', description: 'Active and threatened litigation matters.', cuadTypes: [], factFed: true },
  { id: 'settlements-covenants-not-to-sue', workstreamId: '10-litigation-disputes', title: 'Settlements & covenants not to sue', description: 'Settlement terms and covenants not to sue.', cuadTypes: ['COVENANT_NOT_TO_SUE'], factFed: false },
  { id: 'governmental-investigations', workstreamId: '10-litigation-disputes', title: 'Governmental investigations', description: 'Regulatory or governmental investigations.', cuadTypes: [], factFed: true },

  // 11 — Tax
  { id: 'tax-returns-liabilities', workstreamId: '11-tax', title: 'Tax returns & liabilities', description: 'Filed returns, open audits, and tax liabilities.', cuadTypes: [], factFed: true },
  { id: 'tax-structure-attributes', workstreamId: '11-tax', title: 'Tax structure & attributes', description: 'Structure, NOLs, and other tax attributes.', cuadTypes: [], factFed: true },

  // 12 — Term & Key Dates
  { id: 'signing-effective-expiration', workstreamId: '12-term-key-dates', title: 'Signing / effective / expiration dates', description: 'Key contract dates across the data room.', cuadTypes: ['AGREEMENT_DATE', 'EFFECTIVE_DATE', 'EXPIRATION_DATE'], factFed: false },
  { id: 'milestones-deadlines', workstreamId: '12-term-key-dates', title: 'Milestones & deadlines', description: 'Covenants, milestones, and deadlines to track.', cuadTypes: [], factFed: true },

  // 99 — Catch-all
  { id: 'unmapped-provisions', workstreamId: '99-to-triage', title: 'Unmapped provisions', description: 'Extracted clauses with no checklist mapping — triage and reclassify.', cuadTypes: [], factFed: false },
];

/** Item that catches any clause type without an explicit mapping. */
export const TRIAGE_ITEM_ID = 'unmapped-provisions';

/** clauseType (upper-cased CUAD) → checklist item id. Derived once at import. */
export const CUAD_TYPE_TO_ITEM: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of CHECKLIST_ITEMS) {
    for (const t of item.cuadTypes) {
      map[t.toUpperCase()] = item.id;
    }
  }
  return map;
})();

const ITEMS_BY_ID = new Map(CHECKLIST_ITEMS.map((i) => [i.id, i]));
const WORKSTREAMS_BY_ID = new Map(WORKSTREAMS.map((w) => [w.id, w]));

/** Resolve the checklist item a CUAD clause type files under. Never null: */
/** unmapped types fall back to the triage item. */
export const itemForClauseType = (clauseType: string): ChecklistItem => {
  const itemId = CUAD_TYPE_TO_ITEM[clauseType.toUpperCase()] ?? TRIAGE_ITEM_ID;
  return ITEMS_BY_ID.get(itemId)!;
};

export const getItem = (itemId: string): ChecklistItem | undefined =>
  ITEMS_BY_ID.get(itemId);

export const getWorkstream = (workstreamId: string): Workstream | undefined =>
  WORKSTREAMS_BY_ID.get(workstreamId);

export const itemsForWorkstream = (workstreamId: string): ChecklistItem[] =>
  CHECKLIST_ITEMS.filter((i) => i.workstreamId === workstreamId);
