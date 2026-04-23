/**
 * Playbook service — per-project standard positions that condition extraction.
 * Stored on Project.playbook (Prisma Json). Cached in-memory briefly to avoid
 * re-reading for every extraction within a short window.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  playbookSchema,
  emptyPlaybook,
  type Playbook,
} from '../integrations/claude';

const cache = new Map<string, { playbook: Playbook | null; at: number }>();
const TTL_MS = 30_000;

export const playbookService = {
  async get(projectId: string): Promise<Playbook | null> {
    const cached = cache.get(projectId);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.playbook;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { playbook: true },
    });
    if (!project?.playbook) {
      cache.set(projectId, { playbook: null, at: Date.now() });
      return null;
    }
    const parsed = playbookSchema.safeParse(project.playbook);
    const playbook = parsed.success ? parsed.data : null;
    cache.set(projectId, { playbook, at: Date.now() });
    return playbook;
  },

  async save(projectId: string, playbook: Playbook): Promise<Playbook> {
    const parsed = playbookSchema.parse(playbook);
    await prisma.project.update({
      where: { id: projectId },
      data: { playbook: parsed as unknown as Prisma.InputJsonValue },
    });
    cache.delete(projectId);
    return parsed;
  },

  async clear(projectId: string): Promise<void> {
    await prisma.project.update({
      where: { id: projectId },
      data: { playbook: Prisma.JsonNull },
    });
    cache.delete(projectId);
  },

  template(): Playbook {
    return {
      ...emptyPlaybook,
      dealContext: 'Describe the deal and the firm\'s posture in 1-2 sentences.',
      redFlags: [
        'Uncapped indemnity for fundamental representations.',
        'Change-of-control trigger on any equity transfer.',
      ],
      standardPositions: [
        {
          clauseType: 'CAP_ON_LIABILITY',
          preferredLanguage: 'Aggregate liability capped at 20% of Purchase Price.',
          fallbacks: [
            'Aggregate liability capped at 25% of Purchase Price.',
            'Cap of 2x annual consideration.',
          ],
          riskIfDeviates: 'HIGH',
          notes: 'Uncapped indemnity only for Fraud + Fundamental Reps.',
        },
        {
          clauseType: 'CHANGE_OF_CONTROL',
          preferredLanguage: 'Trigger at ≥ 50% equity transfer.',
          fallbacks: ['Trigger at ≥ 35% equity transfer.'],
          riskIfDeviates: 'HIGH',
        },
      ],
      version: 1,
    };
  },
};
