/**
 * Type-specific extraction guidance. Each document type has:
 *   - alwaysInclude: clauses to emit even if absent (marked "Present: no").
 *   - redFlags: conditions that force HIGH risk on sight.
 *   - focus: narrative paragraph about what matters most for this type.
 *
 * Composed into the full prompt by buildExtractionPrompt().
 */

import type { DocumentType } from '../../schema';

export interface TypeGuidance {
  focus: string;
  alwaysInclude: string[]; // CUAD labels
  redFlags: string[];
}

const TYPE_GUIDANCE: Record<DocumentType, TypeGuidance> = {
  SPA: {
    focus:
      'This is a Stock Purchase Agreement — buyer acquires equity of target. Focus on acquisition mechanics, indemnity structure, survival periods, reps/warranties, escrow, and change-of-control triggers in related documents.',
    alwaysInclude: [
      'CHANGE_OF_CONTROL',
      'CAP_ON_LIABILITY',
      'INDEMNIFICATION',
      'REPRESENTATIONS_AND_WARRANTIES',
      'GOVERNING_LAW',
      'ANTI_ASSIGNMENT',
      'NON_COMPETE',
      'NO_SOLICIT_EMPLOYEES',
      'EXCLUSIVITY',
      'TERMINATION_FOR_CONVENIENCE',
      'WARRANTY_DURATION',
      'CONFIDENTIALITY',
    ],
    redFlags: [
      'Uncapped indemnity for fundamental reps extending beyond 24 months.',
      'Change-of-control trigger on any equity transfer (vs. ≥ 50% threshold).',
      'Sandbagging clause allowing buyer to claim on reps known false at signing.',
      'Escrow below 10% of deal value paired with uncapped indemnity.',
      'Subjective MAC clause ("in Buyer\'s reasonable discretion" or equivalent).',
      'Survival period < 18 months for fundamental reps.',
      'Missing indemnity basket or tipping threshold.',
      'Broad governing law outside Delaware/New York without commercial reason.',
    ],
  },
  APA: {
    focus:
      'This is an Asset Purchase Agreement — buyer acquires specified assets and/or assumes specified liabilities. Focus on asset/liability schedules, successor liability carve-outs, IP assignment, and employee transfer mechanics.',
    alwaysInclude: [
      'CHANGE_OF_CONTROL',
      'CAP_ON_LIABILITY',
      'INDEMNIFICATION',
      'REPRESENTATIONS_AND_WARRANTIES',
      'GOVERNING_LAW',
      'ANTI_ASSIGNMENT',
      'IP_OWNERSHIP_ASSIGNMENT',
      'NON_COMPETE',
      'EXCLUSIVITY',
      'TERMINATION_FOR_CONVENIENCE',
      'WARRANTY_DURATION',
    ],
    redFlags: [
      'Broadly worded assumed-liabilities schedule (e.g. "and all related obligations").',
      'Successor liability not expressly disclaimed.',
      'IP assignment with carve-outs retained by seller in the acquired business.',
      'Non-compete shorter than 3 years or narrower than acquired business scope.',
      'Uncapped indemnity for pre-closing tax or environmental matters.',
    ],
  },
  LOI: {
    focus:
      'This is a Letter of Intent / Term Sheet — non-binding framework for a deal, often with limited binding provisions. Focus on what is binding vs. non-binding, exclusivity periods, break-up fees, and diligence access.',
    alwaysInclude: [
      'EXCLUSIVITY',
      'CONFIDENTIALITY',
      'GOVERNING_LAW',
      'EXPIRATION_DATE',
      'TERMINATION_FOR_CONVENIENCE',
    ],
    redFlags: [
      'Binding exclusivity period > 90 days.',
      'Break-up fee favoring one party disproportionately.',
      'Binding "most favored nation" on future similar transactions.',
      'Binding no-shop with no fiduciary-out for target board.',
    ],
  },
  NDA: {
    focus:
      'This is a non-disclosure / confidentiality agreement. Focus on scope of confidential information, survival, exclusions, non-solicit, and residual-knowledge clauses.',
    alwaysInclude: [
      'CONFIDENTIALITY',
      'EXPIRATION_DATE',
      'GOVERNING_LAW',
      'NON_COMPETE',
      'NO_SOLICIT_EMPLOYEES',
      'NO_SOLICIT_CUSTOMERS',
    ],
    redFlags: [
      'Confidentiality survival > 5 years for non-trade-secret info.',
      'Overbroad definition of Confidential Information (no reasonable exclusions).',
      'No residual knowledge carve-out.',
      'Mutual non-solicit longer than 12 months.',
      'Liquidated damages clause attached to confidentiality breach.',
    ],
  },
  EMPLOYMENT: {
    focus:
      'This is an employment / offer / severance / retention agreement. Focus on at-will vs. fixed-term, severance triggers, clawback, IP assignment, non-compete/non-solicit, and change-of-control acceleration.',
    alwaysInclude: [
      'NON_COMPETE',
      'NO_SOLICIT_EMPLOYEES',
      'NO_SOLICIT_CUSTOMERS',
      'IP_OWNERSHIP_ASSIGNMENT',
      'CONFIDENTIALITY',
      'CHANGE_OF_CONTROL',
      'GOVERNING_LAW',
      'TERMINATION_FOR_CONVENIENCE',
    ],
    redFlags: [
      'Non-compete > 24 months post-termination.',
      'Non-compete geographic scope broader than employee\'s actual work.',
      'Severance tied to broad "constructive termination" definition.',
      'Equity acceleration on single-trigger change-of-control.',
      'IP assignment lacking carve-out for prior inventions.',
      'Clawback extending beyond 12 months post-payment.',
    ],
  },
  LEASE: {
    focus:
      'This is a real estate or equipment lease. Focus on term, rent escalation, assignment/sublet, change-of-control, early termination, and environmental / surrender provisions.',
    alwaysInclude: [
      'ANTI_ASSIGNMENT',
      'CHANGE_OF_CONTROL',
      'TERMINATION_FOR_CONVENIENCE',
      'RENEWAL_TERM',
      'NOTICE_PERIOD_TO_TERMINATE_RENEWAL',
      'GOVERNING_LAW',
      'INSURANCE',
    ],
    redFlags: [
      'Assignment prohibited absent landlord consent with no reasonableness standard.',
      'CoC deemed an assignment (triggers landlord consent on any ownership change).',
      'Automatic renewal with < 6-month termination notice.',
      'Rent escalation > CPI + 3% or index-free automatic increases.',
      'Indemnity favoring landlord for pre-existing environmental conditions.',
    ],
  },
  FINANCIAL: {
    focus:
      'This is a financial statement, cap table, quality-of-earnings report, or similar financial document. Focus on amounts, dates, parties, and any commitments or contingencies. No clause-extraction; emphasize entities (amounts, dates, counterparties).',
    alwaysInclude: [],
    redFlags: [
      'Off-balance-sheet obligations disclosed in footnotes.',
      'Going-concern qualifications.',
      'Material related-party transactions.',
      'Unusual revenue recognition adjustments.',
    ],
  },
  CORPORATE: {
    focus:
      'This is a corporate document — bylaws, resolutions, minutes, formation, certificates. Focus on governance provisions, supermajority thresholds, transfer restrictions, and indemnification of directors/officers.',
    alwaysInclude: [
      'CHANGE_OF_CONTROL',
      'ANTI_ASSIGNMENT',
      'ROFR_ROFO_ROFN',
      'GOVERNING_LAW',
    ],
    redFlags: [
      'Supermajority voting thresholds for ordinary matters.',
      'Director indemnification without exclusions for gross negligence or fraud.',
      'Drag-along rights with low majority threshold (< 60%).',
      'Poison-pill or dead-hand provisions.',
    ],
  },
  GENERIC: {
    focus:
      'Document type was not confidently classified. Apply the full CUAD vocabulary and use your judgment to identify the most material provisions.',
    alwaysInclude: [],
    redFlags: [],
  },
};

const formatTypeBlock = (guidance: TypeGuidance, docType: DocumentType): string => {
  const alwaysList = guidance.alwaysInclude.length
    ? guidance.alwaysInclude.map((c) => `  - ${c}`).join('\n')
    : '  (none required beyond what the document clearly contains)';
  const redFlagsList = guidance.redFlags.length
    ? guidance.redFlags.map((r) => `  - ${r}`).join('\n')
    : '  (no type-specific red flags; use the absolute rubric)';

  return `# Document type: ${docType}

${guidance.focus}

## Always include (emit "Present: no" if absent from the document)
${alwaysList}

## Red flags — treat as HIGH risk on sight
${redFlagsList}
`;
};

export const buildTypeBlock = (docType: DocumentType): string => {
  const guidance = TYPE_GUIDANCE[docType] ?? TYPE_GUIDANCE.GENERIC;
  return formatTypeBlock(guidance, docType);
};

export const getTypeGuidance = (docType: DocumentType): TypeGuidance =>
  TYPE_GUIDANCE[docType] ?? TYPE_GUIDANCE.GENERIC;
