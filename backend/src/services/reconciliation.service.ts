/**
 * Cross-document reconciliation pass.
 *
 *   1. Pull all completed fact sheets in the project.
 *   2. Sonnet merges entities + identifies cross-document relationships.
 *   3. Sonnet flags peer-group anomalies per folder scope.
 *   4. For each distinct scope key in use, Sonnet generates the deal brief.
 *
 * Debounced per project (30s window) so bulk uploads coalesce into one pass.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { isClaudeConfigured } from '../config';
import { s3Service } from './s3.service';
import {
  reconcileGraph,
  detectAnomalies,
  type AttachedDoc,
} from '../integrations/claude';
import { RateLimitExceededAfterRetryError } from '../integrations/claude/tool-use';
import { dealBriefService } from './deal-brief.service';
import { playbookService } from './playbook.service';

const DEBOUNCE_MS = 30_000;
const pending = new Map<string, NodeJS.Timeout>();

const loadAllFactSheets = async (projectId: string): Promise<AttachedDoc[]> => {
  const docs = await prisma.document.findMany({
    where: {
      projectId,
      processingStatus: 'COMPLETE',
      extractionS3Key: { not: null },
    },
    select: { id: true, name: true, extractionS3Key: true },
  });
  const results = await Promise.all(
    docs.map(async (d) => {
      if (!d.extractionS3Key) return null;
      try {
        const md = await s3Service.getObjectText(d.extractionS3Key);
        return {
          documentId: d.id,
          documentName: d.name,
          factSheetMarkdown: md,
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is AttachedDoc => r !== null);
};

const summarizeMasterEntities = (
  entities: Array<{ entityType: string; canonicalName: string; aliases: string[] | null }>
): string => {
  if (entities.length === 0) return '';
  return entities
    .slice(0, 30)
    .map(
      (e) =>
        `- ${e.canonicalName} (${e.entityType})${
          e.aliases && e.aliases.length
            ? ` [aliases: ${e.aliases.join(', ')}]`
            : ''
        }`
    )
    .join('\n');
};

export const reconciliationService = {
  async scheduleRebuild(projectId: string): Promise<void> {
    const existing = pending.get(projectId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      pending.delete(projectId);
      reconciliationService
        .rebuildProjectGraph(projectId)
        .catch(() => undefined);
    }, DEBOUNCE_MS);
    pending.set(projectId, timer);
  },

  async rebuildProjectGraph(projectId: string): Promise<{
    ok: boolean;
    reason?: string;
    scopesGenerated: number;
    scopeErrors: string[];
  }> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      return { ok: false, reason: 'Project not found', scopesGenerated: 0, scopeErrors: [] };
    }

    const factSheets = await loadAllFactSheets(projectId);
    console.log(`[brief] rebuild for ${project.name}: ${factSheets.length} fact sheet(s) loaded`);

    if (factSheets.length === 0) {
      return {
        ok: false,
        reason: 'No completed documents yet. Upload docs and wait for extraction.',
        scopesGenerated: 0,
        scopeErrors: [],
      };
    }

    if (!isClaudeConfigured()) {
      return {
        ok: false,
        reason: 'Claude is not configured (missing ANTHROPIC_API_KEY).',
        scopesGenerated: 0,
        scopeErrors: [],
      };
    }

    const tooLargeStages: string[] = [];

    if (factSheets.length >= 2) {
      try {
        await this.mergeEntities(projectId, factSheets);
      } catch (err) {
        if (err instanceof RateLimitExceededAfterRetryError) {
          tooLargeStages.push('mergeEntities');
        }
        console.warn('[brief] mergeEntities failed:', err instanceof Error ? err.message : err);
      }
    }

    try {
      await this.detectAndStoreAnomalies(projectId, factSheets);
    } catch (err) {
      if (err instanceof RateLimitExceededAfterRetryError) {
        tooLargeStages.push('detectAndStoreAnomalies');
      }
      console.warn('[brief] detectAndStoreAnomalies failed:', err instanceof Error ? err.message : err);
    }

    const playbook = await playbookService.get(projectId);
    const masterEntities = await prisma.masterEntity.findMany({
      where: { projectId },
      select: { entityType: true, canonicalName: true, aliases: true },
    });
    const summary = summarizeMasterEntities(
      masterEntities.map((e) => ({
        entityType: e.entityType,
        canonicalName: e.canonicalName,
        aliases: (e.aliases as string[] | null) ?? [],
      }))
    );

    const scopeKeys = await dealBriefService.getScopeKeysForProject(projectId);
    const scopeErrors: string[] = [];
    let scopesGenerated = 0;

    for (const scopeKey of scopeKeys) {
      try {
        const result = await dealBriefService.rebuildScope({
          projectId,
          projectName: project.name,
          scopeKey,
          playbook,
          masterEntitiesSummary: summary,
        });
        if (result) {
          scopesGenerated++;
          console.log(`[brief] scope "${scopeKey}" → generated (${result.length} chars)`);
        } else {
          const msg = `scope "${scopeKey}" produced no brief (0 fact sheets in scope)`;
          console.warn(`[brief] ${msg}`);
          scopeErrors.push(msg);
        }
      } catch (err) {
        if (err instanceof RateLimitExceededAfterRetryError) {
          tooLargeStages.push(`brief:${scopeKey}`);
        }
        const msg = `scope "${scopeKey}" failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[brief] ${msg}`);
        scopeErrors.push(msg);
      }
    }

    if (tooLargeStages.length > 0) {
      const warning =
        `Rate limit hit even after waiting a full minute on: ${tooLargeStages.join(', ')}. ` +
        `This project's context is too large for the current Anthropic tier's 30K input-tokens-per-minute budget. ` +
        `Consider upgrading the tier, narrowing the project scope, or reducing fact-sheet size.`;
      console.warn(`[brief] ${warning}`);
      scopeErrors.push(warning);
    }

    return {
      ok: scopesGenerated > 0,
      scopesGenerated,
      scopeErrors,
      reason: scopesGenerated === 0 ? scopeErrors[0] ?? 'No scopes generated.' : undefined,
    };
  },

  async mergeEntities(
    projectId: string,
    factSheets: AttachedDoc[]
  ): Promise<void> {
    const result = await reconcileGraph({ factSheets });

    const masterByKey = new Map<string, string>();
    for (const me of result.masterEntities) {
      const upserted = await prisma.masterEntity.upsert({
        where: {
          projectId_entityType_canonicalName: {
            projectId,
            entityType: me.entityType.toUpperCase(),
            canonicalName: me.canonicalName,
          },
        },
        create: {
          projectId,
          entityType: me.entityType.toUpperCase(),
          canonicalName: me.canonicalName,
          aliases: me.aliases,
        },
        update: { aliases: me.aliases },
      });
      masterByKey.set(
        `${me.entityType.toUpperCase()}::${me.canonicalName}`,
        upserted.id
      );
    }

    for (const rel of result.relationships) {
      const sourceId = masterByKey.get(
        `${rel.sourceType.toUpperCase()}::${rel.sourceCanonicalName}`
      );
      const targetId = masterByKey.get(
        `${rel.targetType.toUpperCase()}::${rel.targetCanonicalName}`
      );
      if (!sourceId || !targetId) continue;
      if (rel.confidence < 0.7) continue;
      await prisma.entityRelationship.upsert({
        where: {
          sourceEntityId_targetEntityId_relationshipType: {
            sourceEntityId: sourceId,
            targetEntityId: targetId,
            relationshipType: rel.relationshipType.toUpperCase(),
          },
        },
        create: {
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          relationshipType: rel.relationshipType.toUpperCase(),
          confidence: rel.confidence,
          metadata: { evidenceDocumentIds: rel.evidenceDocumentIds },
        },
        update: {
          confidence: rel.confidence,
          metadata: { evidenceDocumentIds: rel.evidenceDocumentIds },
        },
      });
    }
  },

  async detectAndStoreAnomalies(
    projectId: string,
    factSheets: AttachedDoc[]
  ): Promise<void> {
    if (factSheets.length < 3) {
      // Not enough peers; clear any existing flags.
      await prisma.document.updateMany({
        where: { projectId },
        data: { anomalyFlags: Prisma.JsonNull },
      });
      return;
    }
    const result = await detectAnomalies({ factSheets, scopeLabel: 'project' });

    // Group anomalies by documentId.
    const byDoc = new Map<string, typeof result.anomalies>();
    for (const a of result.anomalies) {
      const arr = byDoc.get(a.documentId) ?? [];
      arr.push(a);
      byDoc.set(a.documentId, arr);
    }

    // Reset anomalyFlags for all project docs; then set for flagged ones.
    await prisma.document.updateMany({
      where: { projectId },
      data: { anomalyFlags: Prisma.JsonNull },
    });

    for (const [documentId, anomalies] of byDoc) {
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: { anomalyFlags: anomalies as unknown as Prisma.InputJsonValue },
        });
      } catch {
        // documentId may not belong to this project — skip
      }
    }
  },
};
