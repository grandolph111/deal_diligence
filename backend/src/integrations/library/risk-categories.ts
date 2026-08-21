/**
 * Canonical M&A risk categories — the spine of a project's knowledge library.
 *
 * SOURCE OF TRUTH: the DUE DILIGENCE ISSUES REPORT template (Bloomberg Law
 * practical guidance) — the deliverable a firm actually hands its client. Its
 * table has one row per Topic, with three working columns: Legal Issues /
 * Discussion Items, Next Steps / Action Items, and Supplemental Diligence
 * Requests. Those 26 Topics are these 26 risk categories, verbatim and in the
 * template's own order.
 *
 * This replaced an earlier 12-workstream x 51-question checklist that was
 * authored in-house. That taxonomy read as authoritative but had no external
 * source; this one is the structure practitioners deliver against, so the deal
 * navigates, scopes and reports on the same axis the client receives.
 *
 * TIERS
 *   Tier 1  Risk category   (26 — carries the coverage status)
 *   Tier 2  Evidence nodes  (clause instances, risks, obligations — filed
 *                            directly under a category)
 *
 * There is deliberately no question tier between them. In the source template
 * a Topic's sub-rows are the *issues found*, not questions pre-asked, and a gap
 * is expressed as a Supplemental Diligence Request rather than an empty slot.
 * A category with no evidence is itself the open gap.
 *
 * This module is pure config: no I/O, no Prisma. The clause-type map and the
 * lookups are derived once at import.
 */

export interface RiskCategory {
  /** Stable slug — the Tier-1 folder name and the unit of access control. */
  id: string;
  /** 1-based display order; mirrors the row order in the issues report. */
  order: number;
  /** Short label for navigation, tabs and graph nodes. */
  title: string;
  /** The template's full Topic wording — used on the report itself. */
  reportTitle: string;
  /** What this category covers, in one line. */
  description: string;
  /**
   * CUAD clause types whose instances file as evidence here. Empty means the
   * category is fact-fed: answered by documents, facts and entities rather than
   * by contract clause language, and no clause type will ever populate it.
   */
  clauseTypes: string[];
  /** True when no clause type maps here — the category is fact-fed. */
  factFed: boolean;
}

type CategorySeed = Omit<RiskCategory, 'factFed'>;

const SEED: CategorySeed[] = [
  {
    id: '01-corporate-formation',
    order: 1,
    title: 'Corporate Formation & Charter',
    reportTitle: 'Corporate Formation and Charter Documents',
    description:
      'Formation, good standing, charter and bylaws, and the corporate structure beneath the target.',
    clauseTypes: [],
  },
  {
    id: '02-stock-certificates-ledgers',
    order: 2,
    title: 'Stock Certificates & Ledgers',
    reportTitle: 'Stock Certificates, Ledgers',
    description:
      'Issued equity, the stock ledger, options, warrants and convertibles — is ownership fully accounted for?',
    clauseTypes: [],
  },
  {
    id: '03-corporate-records',
    order: 3,
    title: 'Corporate Records & Minutes',
    reportTitle:
      'Corporate Records, Meeting Minutes, Written Consents, and Other Authorizing Resolutions',
    description:
      'Board and shareholder minutes, written consents, and the resolutions authorising past corporate acts.',
    clauseTypes: [],
  },
  {
    id: '04-officers-directors',
    order: 4,
    title: 'Officers & Directors',
    reportTitle: 'Officers and Directors, Elections of Same',
    description: 'Who holds office, how they were elected, and whether those elections are documented.',
    clauseTypes: [],
  },
  {
    id: '05-management-shareholders',
    order: 5,
    title: 'Management & Shareholders Agreements',
    reportTitle: 'Management Structure, Shareholders Agreements',
    description:
      'Management structure, shareholder agreements, and the minority or third-party rights that constrain the deal.',
    clauseTypes: ['THIRD_PARTY_BENEFICIARY', 'ROFR_ROFO_ROFN'],
  },
  {
    id: '06-financial-records',
    order: 6,
    title: 'Financial Records',
    reportTitle: 'Financial Records',
    description: 'Financial statements, quality of earnings, and the reliability of reported results.',
    clauseTypes: [],
  },
  {
    id: '07-tax-matters',
    order: 7,
    title: 'Tax Matters',
    reportTitle: 'Tax Matters',
    description: 'Returns, open audits, tax liabilities, structure and attributes.',
    clauseTypes: [],
  },
  {
    id: '08-loans-debt',
    order: 8,
    title: 'Loans & Debt Obligations',
    reportTitle: 'Loans/Debt Obligations',
    description:
      'Debt outstanding, the assets securing it, and any covenant that limits the ability to close.',
    clauseTypes: [],
  },
  {
    id: '09-covid-ppp',
    order: 9,
    title: 'COVID-19 & PPP Loans',
    reportTitle: 'COVID-19 Impacts, PPP Loans and Loan Forgiveness',
    description: 'Pandemic-era relief, PPP borrowing, and the status of any forgiveness application.',
    clauseTypes: [],
  },
  {
    id: '10-real-property',
    order: 10,
    title: 'Real Property',
    reportTitle: 'Real Property',
    description: 'Owned real estate, title, and encumbrances.',
    clauseTypes: [],
  },
  {
    id: '11-leased-property',
    order: 11,
    title: 'Leased Property',
    reportTitle: 'Leased Property',
    description: 'Real-property leases, their terms, and whether they survive or trigger on the deal.',
    clauseTypes: [],
  },
  {
    id: '12-equipment-leases',
    order: 12,
    title: 'Equipment Leases',
    reportTitle: 'Equipment Leases',
    description: 'Equipment leasing arrangements and the obligations they carry.',
    clauseTypes: [],
  },
  {
    id: '13-personal-property',
    order: 13,
    title: 'Personal Property',
    reportTitle: 'Personal Property',
    description: 'Owned tangible personal property and any liens against it.',
    clauseTypes: [],
  },
  {
    id: '14-intellectual-property',
    order: 14,
    title: 'Intellectual Property',
    reportTitle: 'Intellectual Property',
    description:
      'Ownership and assignment of IP, inbound and outbound licences, escrow, and open-source exposure.',
    clauseTypes: [
      'IP_OWNERSHIP_ASSIGNMENT',
      'JOINT_IP_OWNERSHIP',
      'LICENSE_GRANT',
      'IRREVOCABLE_OR_PERPETUAL_LICENSE',
      'NON_TRANSFERABLE_LICENSE',
      'UNLIMITED_LICENSE',
      'AFFILIATE_LICENSE_LICENSEE',
      'AFFILIATE_LICENSE_LICENSOR',
      'SOURCE_CODE_ESCROW',
    ],
  },
  {
    id: '15-material-contracts',
    order: 15,
    title: 'Material Contracts',
    reportTitle:
      'Material Contracts (including Subcontracts, Key Customers, Vendors, and Suppliers)',
    description:
      'Customer, vendor and supplier agreements — economics, exclusivity, term, liability allocation, and the change-of-control triggers this deal fires.',
    // The template's own note on this row is "Identify All Contracts That Include
    // Change Of Control Provisions", so CoC and assignment file here rather than
    // under the corporate categories.
    clauseTypes: [
      'CHANGE_OF_CONTROL',
      'ANTI_ASSIGNMENT',
      'EXCLUSIVITY',
      'MOST_FAVORED_NATION',
      'MINIMUM_COMMITMENT',
      'VOLUME_RESTRICTION',
      'PRICE_RESTRICTIONS',
      'PAYMENT_TERMS',
      'REVENUE_OR_PROFIT_SHARING',
      'LIQUIDATED_DAMAGES',
      'TERMINATION_FOR_CONVENIENCE',
      'RENEWAL_TERM',
      'NOTICE_PERIOD_TO_TERMINATE_RENEWAL',
      'POST_TERMINATION_SERVICES',
      'INDEMNIFICATION',
      'CAP_ON_LIABILITY',
      'UNCAPPED_LIABILITY',
      'REPRESENTATIONS_AND_WARRANTIES',
      'WARRANTY_DURATION',
      'INSURANCE',
      'GOVERNING_LAW',
      'AGREEMENT_DATE',
      'EFFECTIVE_DATE',
      'EXPIRATION_DATE',
    ],
  },
  {
    id: '16-government-contracts',
    order: 16,
    title: 'Government Contracts',
    reportTitle: 'Government Contracts (if applicable)',
    description: 'Public-sector contracts and the flow-down obligations that come with them.',
    clauseTypes: [],
  },
  {
    id: '17-litigation',
    order: 17,
    title: 'Litigation',
    reportTitle: 'Litigation, Pending or Threatened',
    description: 'Active and threatened proceedings, settlements, and covenants not to sue.',
    clauseTypes: ['COVENANT_NOT_TO_SUE'],
  },
  {
    id: '18-lien-judgment-searches',
    order: 18,
    title: 'Lien & Judgment Searches',
    reportTitle: 'Lien and Judgement Searches',
    description:
      'Search results across every jurisdiction where the target does business or has employees. Evidence here often originates outside the data room.',
    clauseTypes: [],
  },
  {
    id: '19-regulatory-matters',
    order: 19,
    title: 'Regulatory Matters & Audits',
    reportTitle: 'Regulatory Matters, Audits, and Investigations',
    description:
      'Licences and permits, audit rights, investigations, anti-corruption and sanctions exposure, and merger control.',
    clauseTypes: ['AUDIT_RIGHTS'],
  },
  {
    id: '20-employees-contractors',
    order: 20,
    title: 'Employees & Contractors',
    reportTitle:
      'Employees (full and part-time), Independent Contractors, and Consultants',
    description:
      'Workforce composition, employment agreements, compensation, and restrictive covenants.',
    clauseTypes: [
      'NON_COMPETE',
      'NO_SOLICIT_EMPLOYEES',
      'NO_SOLICIT_CUSTOMERS',
      'NON_DISPARAGEMENT',
      'COMPETITIVE_RESTRICTION_EXCEPTION',
    ],
  },
  {
    id: '21-employee-handbooks',
    order: 21,
    title: 'Handbooks & Employment Policies',
    reportTitle: 'Employee Handbooks, Manuals, and other Employment Policies',
    description: 'Handbooks, manuals and written policies, and whether practice matches them.',
    clauseTypes: [],
  },
  {
    id: '22-employee-benefits-labor',
    order: 22,
    title: 'Benefits & Labor',
    reportTitle: 'Employee Benefits, Labor, and Other Employee Matters',
    description:
      'Benefit plans and ERISA exposure, union matters, and worker-classification risk.',
    clauseTypes: [],
  },
  {
    id: '23-employment-litigation',
    order: 23,
    title: 'Employment Litigation',
    reportTitle: 'Employment Litigation, Pending or Threatened',
    description: 'Employment claims and proceedings, active or threatened.',
    clauseTypes: [],
  },
  {
    id: '24-environmental',
    order: 24,
    title: 'Environmental Matters',
    reportTitle: 'Environmental Matters',
    description: 'Environmental liabilities tied to property or operations.',
    clauseTypes: [],
  },
  {
    id: '25-data-privacy-security',
    order: 25,
    title: 'Data Privacy & Security',
    reportTitle:
      'Data Privacy and Security Issues, Cybersecurity Policies and Procedures, and Data Privacy or Cybersecurity Incidents',
    description:
      'Confidentiality obligations, privacy-law compliance, security policies, and incident history.',
    clauseTypes: ['CONFIDENTIALITY'],
  },
  {
    id: '26-other-red-flags',
    order: 26,
    title: 'Other Issues & Red Flags',
    reportTitle: 'Other Issues/Red Flags',
    description:
      'Anything material that belongs to no other category — including extracted provisions with no mapping, which land here rather than being dropped.',
    clauseTypes: [],
  },
];

export const RISK_CATEGORIES: RiskCategory[] = SEED.map((c) => ({
  ...c,
  factFed: c.clauseTypes.length === 0,
}));

/**
 * Where a clause type with no explicit mapping lands. The template's own
 * catch-all row, so an unmapped provision is visible as an issue to triage
 * rather than silently absent.
 */
export const TRIAGE_CATEGORY_ID = '26-other-red-flags';

/** The category that holds the bulk of contract clause language. */
export const MATERIAL_CONTRACTS_ID = '15-material-contracts';

/** clauseType (upper-cased) → risk category id. Derived once at import. */
export const CLAUSE_TYPE_TO_CATEGORY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const category of RISK_CATEGORIES) {
    for (const t of category.clauseTypes) map[t.toUpperCase()] = category.id;
  }
  return map;
})();

const BY_ID = new Map(RISK_CATEGORIES.map((c) => [c.id, c]));

/** Resolve the category a clause type files under. Never null — falls back to triage. */
export const categoryForClauseType = (clauseType: string): RiskCategory => {
  const id = CLAUSE_TYPE_TO_CATEGORY[clauseType.toUpperCase()] ?? TRIAGE_CATEGORY_ID;
  return BY_ID.get(id)!;
};

export const getRiskCategory = (id: string): RiskCategory | undefined => BY_ID.get(id);

export const isRiskCategoryId = (id: string): boolean => BY_ID.has(id);

/** Every category id, in report order. */
export const RISK_CATEGORY_IDS: string[] = RISK_CATEGORIES.map((c) => c.id);

/**
 * Legacy workstream/checklist-item slug → risk category id.
 *
 * Kept so a project seeded under the old 12-workstream taxonomy can be re-filed
 * without re-reading a single document: every provision already carries its
 * clause type and source, so re-filing is deterministic and free. Referenced by
 * the migration and by the re-file script; nothing in the live read path should
 * need it.
 */
export const LEGACY_SLUG_TO_CATEGORY: Record<string, string> = {
  // --- Tier-1 workstream slugs ---
  '01-corporate-org': '01-corporate-formation',
  '02-financial': '06-financial-records',
  '03-commercial-contracts': MATERIAL_CONTRACTS_ID,
  '04-intellectual-property': '14-intellectual-property',
  '05-liability-risk': MATERIAL_CONTRACTS_ID,
  '06-employment-benefits': '20-employees-contractors',
  '07-real-property': '10-real-property',
  '08-regulatory-compliance': '19-regulatory-matters',
  '09-data-privacy': '25-data-privacy-security',
  '10-litigation-disputes': '17-litigation',
  '11-tax': '07-tax-matters',
  '12-term-key-dates': MATERIAL_CONTRACTS_ID,
  '99-to-triage': TRIAGE_CATEGORY_ID,

  // --- Tier-2 checklist item slugs ---
  'entity-formation': '01-corporate-formation',
  'subsidiaries-structure': '01-corporate-formation',
  'cap-table-ownership': '02-stock-certificates-ledgers',
  'governance-voting': '04-officers-directors',
  'minority-third-party-rights': '05-management-shareholders',
  'coc-assignment-triggers': MATERIAL_CONTRACTS_ID,
  'financial-statements-qoe': '06-financial-records',
  'indebtedness-liens': '08-loans-debt',
  'payment-terms': MATERIAL_CONTRACTS_ID,
  'liquidated-damages': MATERIAL_CONTRACTS_ID,
  'revenue-profit-sharing': MATERIAL_CONTRACTS_ID,
  'material-customer-agreements': MATERIAL_CONTRACTS_ID,
  'material-supplier-agreements': MATERIAL_CONTRACTS_ID,
  'exclusivity-mfn': MATERIAL_CONTRACTS_ID,
  'minimum-volume-commitments': MATERIAL_CONTRACTS_ID,
  'pricing-restrictions': MATERIAL_CONTRACTS_ID,
  'termination-renewal-exposure': MATERIAL_CONTRACTS_ID,
  'post-termination-obligations': MATERIAL_CONTRACTS_ID,
  'ip-ownership-assignment': '14-intellectual-property',
  'licenses-in-out': '14-intellectual-property',
  'source-code-escrow': '14-intellectual-property',
  'open-source-exposure': '14-intellectual-property',
  'ip-litigation': '14-intellectual-property',
  'liability-caps': MATERIAL_CONTRACTS_ID,
  indemnification: MATERIAL_CONTRACTS_ID,
  'reps-warranties': MATERIAL_CONTRACTS_ID,
  insurance: MATERIAL_CONTRACTS_ID,
  'key-employees-retention': '20-employees-contractors',
  'employment-agreements-comp': '20-employees-contractors',
  'restrictive-covenants': '20-employees-contractors',
  'benefit-plans-erisa': '22-employee-benefits-labor',
  'labor-classification': '22-employee-benefits-labor',
  'owned-property': '10-real-property',
  leases: '11-leased-property',
  environmental: '24-environmental',
  'governing-law-jurisdiction': MATERIAL_CONTRACTS_ID,
  'audit-rights': '19-regulatory-matters',
  'licenses-permits': '19-regulatory-matters',
  'anti-corruption-sanctions': '19-regulatory-matters',
  'antitrust-hsr': '19-regulatory-matters',
  'confidentiality-obligations': '25-data-privacy-security',
  'data-protection-compliance': '25-data-privacy-security',
  'security-incidents': '25-data-privacy-security',
  'pending-litigation': '17-litigation',
  'settlements-covenants-not-to-sue': '17-litigation',
  'governmental-investigations': '19-regulatory-matters',
  'tax-returns-liabilities': '07-tax-matters',
  'tax-structure-attributes': '07-tax-matters',
  'signing-effective-expiration': MATERIAL_CONTRACTS_ID,
  'milestones-deadlines': MATERIAL_CONTRACTS_ID,
  'unmapped-provisions': TRIAGE_CATEGORY_ID,
};

/** Map a legacy slug onto its category; unknown slugs land in triage. */
export const categoryForLegacySlug = (slug: string): string =>
  LEGACY_SLUG_TO_CATEGORY[slug] ?? TRIAGE_CATEGORY_ID;
