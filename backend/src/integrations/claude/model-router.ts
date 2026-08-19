/**
 * Tiered model selection for extraction.
 *
 * Sonnet is the baseline: every tier at or below medium resolves to it. Extraction
 * quality is the product, and a short document is cheap to read well, so there is no
 * tier that trades measured accuracy for a few cents.
 *   - Small (≤ N pages) / Medium (N < p ≤ M pages): Sonnet — the evaluated baseline.
 *   - Large (> M pages): Opus — premium; complex collaboration/debt agreements.
 *
 * The small/medium split is retained because it is the seam a cheaper tier would slot
 * into, and because document type can still bump a short dense instrument (SPA/APA/LOI)
 * up out of it. Point CLAUDE_EXTRACTION_MODEL_SMALL at a cheaper model to re-open that
 * seam — and run the CUAD harness against it first.
 *
 * Thresholds + model IDs are env-configurable.
 */

import { config } from '../../config';
import type { DocumentType } from './schema';

export type ModelTier = 'small' | 'medium' | 'large';

export interface RouterInput {
  pageCount?: number | null;
  documentType?: DocumentType;
  /** Triage tier — sets a floor on model fidelity (P0 → large, P1 → medium). */
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
}

const TIER_RANK: Record<ModelTier, number> = { small: 0, medium: 1, large: 2 };
const RANK_TIER: ModelTier[] = ['small', 'medium', 'large'];
const maxTier = (a: ModelTier, b: ModelTier): ModelTier =>
  RANK_TIER[Math.max(TIER_RANK[a], TIER_RANK[b])];

/** Minimum tier a priority tier is willing to be read at. */
const priorityFloor = (priority?: string): ModelTier =>
  priority === 'P0' ? 'large' : priority === 'P1' ? 'medium' : 'small';

export interface RouterDecision {
  model: string;
  tier: ModelTier;
  reason: string;
}

const TYPES_FORCING_MEDIUM: DocumentType[] = ['SPA', 'APA', 'LOI'];
const TYPES_ALLOWING_SMALL: DocumentType[] = ['NDA', 'EMPLOYMENT', 'CORPORATE', 'FINANCIAL'];

const pickBase = (pageCount: number, small: number, medium: number): ModelTier => {
  if (pageCount <= small) return 'small';
  if (pageCount <= medium) return 'medium';
  return 'large';
};

const applyTypeAdjustment = (
  baseTier: ModelTier,
  documentType?: DocumentType
): { tier: ModelTier; bumped: boolean } => {
  if (!documentType) return { tier: baseTier, bumped: false };

  // Dense deal instruments → never read at the small tier; bump small → medium.
  if (TYPES_FORCING_MEDIUM.includes(documentType) && baseTier === 'small') {
    return { tier: 'medium', bumped: true };
  }

  // Light document types → could be allowed to drop a tier even when the page count
  // sits in the medium band. Not wired: with Sonnet as the baseline there is nothing
  // cheaper to drop to. Revisit only alongside an eval of whatever tier gets added.

  return { tier: baseTier, bumped: false };
};

const resolveModelId = (tier: ModelTier): string => {
  const direct = config.claude.models.extractionRouter;
  const bedrock = config.claude.bedrockModels.extractionRouter;
  const useBedrock = config.claude.provider === 'bedrock';
  return useBedrock ? bedrock[tier] : direct[tier];
};

export const pickExtractionModel = (input: RouterInput): RouterDecision => {
  // 1. Manual override wins — keep backwards compat with CLAUDE_MODEL_EXTRACTION.
  const override = config.claude.models.extractionOverride;
  const overrideBedrock = config.claude.bedrockModels.extractionOverride;
  const useBedrock = config.claude.provider === 'bedrock';
  const activeOverride = useBedrock ? overrideBedrock : override;
  if (activeOverride && activeOverride.length > 0) {
    return {
      model: activeOverride,
      tier: 'medium',
      reason: `override via CLAUDE_MODEL_EXTRACTION${useBedrock ? ' (bedrock)' : ''}`,
    };
  }

  // 2. No page count (e.g. .docx, text) → default to medium.
  const pageCount = input.pageCount;
  const floor = priorityFloor(input.priority);

  if (pageCount == null || pageCount <= 0) {
    const tier = maxTier('medium', floor);
    return {
      model: resolveModelId(tier),
      tier,
      reason: `no page count; default medium${input.priority ? `, priority ${input.priority} floor ${floor}` : ''} → ${tier}`,
    };
  }

  // 3. Route by page count + document-type adjustment, then lift to the priority floor.
  const { small, medium } = config.claude.extractionThresholds;
  const baseTier = pickBase(pageCount, small, medium);
  const adjusted = applyTypeAdjustment(baseTier, input.documentType);
  const tier = maxTier(adjusted.tier, floor);
  const pieces = [`pages=${pageCount}→${adjusted.tier}`];
  if (adjusted.bumped) pieces.push(`type=${input.documentType} bumped`);
  if (TIER_RANK[floor] > TIER_RANK[adjusted.tier]) pieces.push(`priority ${input.priority} floor ${floor}`);
  return {
    model: resolveModelId(tier),
    tier,
    reason: `${pieces.join(', ')} → ${tier}`,
  };
};
