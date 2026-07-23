/**
 * Deal Brief service.
 *
 * Stores one brief per (project × scope) at `projects/{projectId}/briefs/{scopeKey}.md`.
 * Reconciliation enumerates distinct scope keys in use and regenerates all of them.
 * Human-edit endpoints write back specific human sections only, preserving
 * AI sections byte-for-byte.
 */

import { Prisma, type ProjectMember } from '@prisma/client';
import { prisma } from '../config/database';
import { s3Service } from './s3.service';
import {
  HUMAN_SECTION_IDS,
  type HumanSectionId,
  extractHumanSections,
  spliceHumanSections,
  updateHumanSection,
} from '../utils/brief-markers';
import { computeScopeKey, SCOPE_FULL } from '../utils/scope-key';
import { isClaudeConfigured } from '../config';
import { generateDealBrief, type AttachedDoc, type Playbook } from '../integrations/claude';
import { documentsService } from '../modules/documents/documents.service';
import { libraryWriterService } from './library-writer.service';

/**
 * Resolve a scope key to its in-scope document ids (null = full access / all).
 * Cheap — no S3 reads — so the library-digest brief path never loads fact sheets.
 */
const resolveScopeDocIds = async (
  projectId: string,
  scopeKey: string
): Promise<Set<string> | null> => {
  if (scopeKey === SCOPE_FULL) return null;
  const members = await prisma.projectMember.findMany({ where: { projectId } });
  const matching = members.find((m) => computeScopeKey(m) === scopeKey);
  const permissions = matching?.permissions as Record<string, unknown> | null;
  const restricted = permissions?.restrictedFolders as string[] | undefined;
  if (!restricted || restricted.length === 0) return new Set();
  const allowed = await documentsService.getAccessibleFolderIds(projectId, restricted);
  const docs = await prisma.document.findMany({
    where: { projectId, processingStatus: 'COMPLETE', folderId: { in: allowed } },
    select: { id: true },
  });
  return new Set(docs.map((d) => d.id));
};

const briefKey = (projectId: string, scopeKey: string): string =>
  `projects/${projectId}/briefs/${scopeKey}.md`;

interface BriefManifestEntry {
  s3Key: string;
  updatedAt: string;
}
type BriefManifest = Record<string, BriefManifestEntry>;

const parseManifest = (raw: Prisma.JsonValue | null): BriefManifest => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: BriefManifest = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      v &&
      typeof v === 'object' &&
      's3Key' in v &&
      'updatedAt' in v &&
      typeof (v as Record<string, unknown>).s3Key === 'string'
    ) {
      out[k] = v as unknown as BriefManifestEntry;
    }
  }
  return out;
};

const loadFactSheetsForScope = async (
  projectId: string,
  scopeKey: string
): Promise<AttachedDoc[]> => {
  const where: {
    projectId: string;
    processingStatus: 'COMPLETE';
    extractionS3Key: { not: null };
    folderId?: { in: string[] };
  } = {
    projectId,
    processingStatus: 'COMPLETE',
    extractionS3Key: { not: null },
  };

  if (scopeKey !== SCOPE_FULL) {
    // Need to find which folder IDs map to this scopeKey. Simplest: enumerate
    // members whose scopeKey matches, take their restrictedFolders, expand.
    const members = await prisma.projectMember.findMany({
      where: { projectId },
    });
    const matching = members.find(
      (m) => computeScopeKey(m) === scopeKey
    );
    const permissions = matching?.permissions as Record<string, unknown> | null;
    const restricted = permissions?.restrictedFolders as string[] | undefined;
    if (!restricted || restricted.length === 0) return [];
    const allowed = await documentsService.getAccessibleFolderIds(
      projectId,
      restricted
    );
    where.folderId = { in: allowed };
  }

  const docs = await prisma.document.findMany({
    where,
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

export const dealBriefService = {
  briefKey,

  async getScopeKeysForProject(projectId: string): Promise<string[]> {
    const members = await prisma.projectMember.findMany({
      where: { projectId },
    });
    const keys = new Set<string>();
    for (const m of members) keys.add(computeScopeKey(m));
    if (keys.size === 0) keys.add(SCOPE_FULL);
    return [...keys];
  },

  async loadBrief(
    projectId: string,
    scopeKey: string
  ): Promise<string | null> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { briefManifest: true },
    });
    const manifest = parseManifest(project?.briefManifest ?? null);
    const entry = manifest[scopeKey];
    if (!entry) return null;
    try {
      return await s3Service.getObjectText(entry.s3Key);
    } catch {
      return null;
    }
  },

  async loadBriefForMember(member: ProjectMember): Promise<string | null> {
    const scopeKey = computeScopeKey(member);
    return this.loadBrief(member.projectId, scopeKey);
  },

  async rebuildScope(args: {
    projectId: string;
    projectName: string;
    scopeKey: string;
    playbook: Playbook | null;
    masterEntitiesSummary: string;
  }): Promise<string | null> {
    if (!isClaudeConfigured()) return null;

    // Scalable brief (Phase C): when the library is enabled, "reduce" over a
    // bounded library DIGEST (coverage + top evidence per workstream + entities +
    // anomalies) instead of stuffing every in-scope fact sheet — so brief input is
    // independent of document count. Otherwise fall back to the legacy fact-sheet path.
    let factSheets: AttachedDoc[];
    if (libraryWriterService.isEnabled() && (await libraryWriterService.isSeeded(args.projectId))) {
      const allowedDocIds = await resolveScopeDocIds(args.projectId, args.scopeKey);
      if (allowedDocIds !== null && allowedDocIds.size === 0) return null; // restricted, no docs in scope
      const digest = await libraryWriterService.buildDigest(args.projectId, allowedDocIds);
      factSheets = [
        { documentId: 'library-digest', documentName: 'Deal library digest', factSheetMarkdown: digest },
      ];
    } else {
      factSheets = await loadFactSheetsForScope(args.projectId, args.scopeKey);
      if (factSheets.length === 0) return null;
    }

    const prev = await this.loadBrief(args.projectId, args.scopeKey);
    const humanSections = extractHumanSections(prev);

    const response = await generateDealBrief({
      projectName: args.projectName,
      scopeLabel: args.scopeKey,
      factSheets,
      masterEntitiesSummary: args.masterEntitiesSummary,
      playbook: args.playbook,
      previousBriefHumanSections: humanSections,
    });

    const merged = spliceHumanSections(response.brief, humanSections);
    const key = briefKey(args.projectId, args.scopeKey);
    await s3Service.putObjectText(key, merged);

    await this.updateManifest(args.projectId, args.scopeKey, key);
    return merged;
  },

  async updateManifest(
    projectId: string,
    scopeKey: string,
    s3Key: string
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { briefManifest: true },
    });
    const manifest = parseManifest(project?.briefManifest ?? null);
    manifest[scopeKey] = { s3Key, updatedAt: new Date().toISOString() };
    await prisma.project.update({
      where: { id: projectId },
      data: { briefManifest: manifest as unknown as Prisma.InputJsonValue },
    });
  },

  async updateHumanSection(args: {
    projectId: string;
    scopeKey: string;
    sectionId: HumanSectionId;
    content: string;
  }): Promise<string> {
    const existing = await this.loadBrief(args.projectId, args.scopeKey);
    if (!existing) {
      throw new Error('No brief exists for this scope yet — upload some docs first.');
    }
    const updated = updateHumanSection(
      existing,
      args.sectionId,
      args.content
    );
    const key = briefKey(args.projectId, args.scopeKey);
    await s3Service.putObjectText(key, updated);
    await this.updateManifest(args.projectId, args.scopeKey, key);
    return updated;
  },

  isHumanSection(id: string): id is HumanSectionId {
    return (HUMAN_SECTION_IDS as readonly string[]).includes(id);
  },

  parseManifest,
};
