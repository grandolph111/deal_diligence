/**
 * Deterministic entity blocking (Phase C scaling).
 *
 * The MVP built master entities by sending every fact sheet to Sonnet — dead at
 * tens of thousands of documents (and tens of thousands of entity mentions).
 * Entity resolution at scale is a blocking problem: normalize each mention's name
 * (strip legal suffixes, lowercase), group mentions that share a (type, key)
 * block, and each block becomes one canonical MasterEntity. O(n), no LLM, no
 * context ceiling.
 *
 * The remaining LLM judgment — merging genuinely ambiguous blocks ("Apex Partners"
 * vs "Apex Capital") — becomes a bounded pass over the small tail of near-key
 * collisions, not a read of the whole corpus. (That refinement is left as a hook;
 * blocking alone resolves the overwhelming majority.)
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const BLOCK_TYPES = ['ORGANIZATION', 'PERSON', 'JURISDICTION'];

/** Normalized block key. Orgs strip legal suffixes so "Acme Corp." == "Acme Corporation". */
const blockKey = (type: string, text: string): string => {
  let s = text.toLowerCase().replace(/[,'"()]/g, '').replace(/\s*&\s*/g, ' and ');
  if (type === 'ORGANIZATION') {
    s = s.replace(/\s*(inc\.?|llc\.?|ltd\.?|corp\.?|plc\.?|co\.?|limited|incorporated|corporation|lp|l\.p\.|holdings?)\.?\s*$/i, '');
  }
  s = s.replace(/^(the|a|an)\s+/i, '').replace(/\s+/g, ' ').trim();
  return s || text.toLowerCase().trim();
};

export const entityBlockingService = {
  /**
   * Rebuild canonical master entities for a project from DocumentEntity mentions,
   * by deterministic blocking. Returns counts. Idempotent.
   */
  async blockEntities(projectId: string): Promise<{ masterEntities: number; mentionsLinked: number }> {
    const mentions = await prisma.documentEntity.findMany({
      where: {
        document: { projectId },
        entityType: { in: BLOCK_TYPES },
      },
      select: { id: true, entityType: true, text: true },
    });

    // Group mentions into blocks.
    const blocks = new Map<string, { entityType: string; texts: Map<string, number>; ids: string[] }>();
    for (const m of mentions) {
      if (!m.text || !m.text.trim()) continue;
      const type = m.entityType.toUpperCase();
      const key = `${type}::${blockKey(type, m.text)}`;
      const b = blocks.get(key) ?? { entityType: type, texts: new Map<string, number>(), ids: [] as string[] };
      b.texts.set(m.text, (b.texts.get(m.text) ?? 0) + 1);
      b.ids.push(m.id);
      blocks.set(key, b);
    }

    let masterEntities = 0;
    let mentionsLinked = 0;
    for (const b of blocks.values()) {
      // Canonical = the most complete surface form (longest, tie-broken by frequency).
      const variants = [...b.texts.entries()].sort(
        (a, z) => z[0].length - a[0].length || z[1] - a[1]
      );
      const canonicalName = variants[0][0];
      const aliases = variants.slice(1).map((v) => v[0]);

      const aliasesJson = aliases as unknown as Prisma.InputJsonValue;
      const me = await prisma.masterEntity.upsert({
        where: {
          projectId_entityType_canonicalName: { projectId, entityType: b.entityType, canonicalName },
        },
        create: { projectId, entityType: b.entityType, canonicalName, aliases: aliasesJson },
        update: { aliases: aliasesJson },
        select: { id: true },
      });
      masterEntities += 1;

      await prisma.documentEntity.updateMany({
        where: { id: { in: b.ids } },
        data: { masterEntityId: me.id },
      });
      mentionsLinked += b.ids.length;
    }

    return { masterEntities, mentionsLinked };
  },
};
