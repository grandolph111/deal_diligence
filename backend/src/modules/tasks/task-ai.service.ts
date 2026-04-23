/**
 * Task AI runner.
 *
 * When a user drags an AI task to IN_PROGRESS, this service runs Claude with
 * the user's prompt + the attached documents' fact sheets and writes a risk
 * report markdown file for specialist review.
 */

import { TaskAiStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { config, isClaudeConfigured } from '../../config';
import { s3Service } from '../../services/s3.service';
import { dealBriefService } from '../../services/deal-brief.service';
import {
  generateRiskReport,
  type AttachedDoc,
} from '../../integrations/claude';

const reportKey = (taskId: string) => `reports/${taskId}.md`;

const buildMockReport = (docs: AttachedDoc[], prompt: string): string => `# Risk Report (mock)
**Model**: mock · **Documents analyzed**: ${docs.length}

## Summary
(Mock mode — Claude not configured.) User prompt: "${prompt}". This is placeholder content so the UI flow can be tested without an API key.

## Key Findings
${docs.map((d, i) => `${i + 1}. ${d.documentName} — placeholder finding.`).join('\n')}

## Risks
| Risk | Severity | Source | Recommendation |
|---|---|---|---|
| Example risk | medium | mock | Configure ANTHROPIC_API_KEY for real reports. |

## Recommended Follow-ups
- Configure Claude to generate real reports.

## Citations
${docs.map((d) => `- [${d.documentName} p.1] "placeholder quote"`).join('\n')}
`;

const log = (taskId: string, msg: string) => {
  // eslint-disable-next-line no-console
  console.log(`[task-ai ${taskId.slice(0, 8)}] ${msg}`);
};
const logWarn = (taskId: string, msg: string) => {
  // eslint-disable-next-line no-console
  console.warn(`[task-ai ${taskId.slice(0, 8)}] ${msg}`);
};
const logError = (taskId: string, msg: string, err?: unknown) => {
  // eslint-disable-next-line no-console
  console.error(
    `[task-ai ${taskId.slice(0, 8)}] ${msg}`,
    err instanceof Error ? err.stack ?? err.message : err ?? ''
  );
};

export const taskAiService = {
  async runAiTask(taskId: string, actingUserId: string): Promise<void> {
    const wallStart = Date.now();
    log(taskId, `run requested by user=${actingUserId.slice(0, 8)}`);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        attachments: {
          include: {
            document: {
              select: {
                id: true,
                name: true,
                folderId: true,
                projectId: true,
                extractionS3Key: true,
              },
            },
          },
        },
      },
    });
    if (!task) {
      logError(taskId, `task not found — aborting`);
      throw new Error(`Task not found: ${taskId}`);
    }
    if (!task.aiPrompt) {
      logError(taskId, `task has no aiPrompt — aborting`);
      throw new Error('Task has no AI prompt');
    }
    if (task.aiStatus === 'RUNNING') {
      log(taskId, `already RUNNING — idempotent early-return`);
      return;
    }
    log(
      taskId,
      `task="${task.title.slice(0, 60)}" prompt=${task.aiPrompt.length}ch ` +
        `attachments=${task.attachments.length} project=${task.projectId.slice(0, 8)}`
    );

    // Folder-scope enforcement for the acting user
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: task.projectId, userId: actingUserId },
      },
    });
    if (!membership) {
      logError(taskId, `acting user is not a project member — aborting`);
      throw new Error('Acting user is not a member of this project');
    }
    const isFullAccess =
      membership.role === 'OWNER' || membership.role === 'ADMIN';
    const permissions = membership.permissions as
      | Record<string, unknown>
      | null;
    const restrictedFolders = permissions?.restrictedFolders as
      | string[]
      | undefined;
    log(
      taskId,
      `member role=${membership.role} scope=${
        isFullAccess
          ? 'full'
          : `restricted(${restrictedFolders?.length ?? 0} folders)`
      }`
    );

    if (!isFullAccess && restrictedFolders && restrictedFolders.length > 0) {
      for (const a of task.attachments) {
        if (!a.document.folderId) continue;
        if (!restrictedFolders.includes(a.document.folderId)) {
          logError(
            taskId,
            `attached doc ${a.document.id} outside folder scope — aborting`
          );
          throw new Error(
            `Attached document ${a.document.id} is outside your folder scope`
          );
        }
      }
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        aiStatus: 'RUNNING' as TaskAiStatus,
        aiStartedAt: new Date(),
        aiError: null,
      },
    });

    try {
      log(taskId, `status → RUNNING`);

      // Load fact sheets from S3 for attached docs.
      const factSheets: AttachedDoc[] = [];
      let skipped = 0;
      for (const a of task.attachments) {
        if (!a.document.extractionS3Key) {
          skipped++;
          logWarn(
            taskId,
            `skip fact sheet: doc=${a.document.id.slice(
              0,
              8
            )} "${a.document.name}" has no extractionS3Key (not processed yet?)`
          );
          continue;
        }
        try {
          const md = await s3Service.getObjectText(a.document.extractionS3Key);
          factSheets.push({
            documentId: a.document.id,
            documentName: a.document.name,
            factSheetMarkdown: md,
          });
        } catch (err) {
          skipped++;
          logWarn(
            taskId,
            `skip fact sheet: doc=${a.document.id.slice(
              0,
              8
            )} "${a.document.name}" unreadable from S3 (${
              err instanceof Error ? err.message : String(err)
            })`
          );
        }
      }
      const totalFactSheetChars = factSheets.reduce(
        (sum, fs) => sum + fs.factSheetMarkdown.length,
        0
      );
      log(
        taskId,
        `fact sheets loaded=${factSheets.length} skipped=${skipped} total=${totalFactSheetChars}ch`
      );

      // Load the scope-filtered deal brief — primary context.
      const brief = await dealBriefService.loadBriefForMember(membership);
      log(
        taskId,
        `deal brief ${
          brief
            ? `loaded=${brief.length}ch`
            : 'NOT AVAILABLE (no rebuild yet or scope has no docs)'
        }`
      );

      let reportMarkdown: string;
      let summary: string;
      let modelId: string;
      let confidenceScore: number | null;
      let confidenceReason: string | null;

      if (!isClaudeConfigured()) {
        log(taskId, `Claude not configured — generating MOCK report`);
        reportMarkdown = buildMockReport(factSheets, task.aiPrompt);
        summary = `Mock report for prompt: "${task.aiPrompt.slice(0, 120)}"`;
        modelId = 'mock';
        confidenceScore = 82;
        confidenceReason =
          'Mock — not a real confidence score. Configure ANTHROPIC_API_KEY for real values.';
      } else {
        log(
          taskId,
          `calling Claude generateRiskReport model=${config.claude.models.report} attachedDocs=${factSheets.length} brief=${brief ? 'yes' : 'no'}`
        );
        const result = await generateRiskReport({
          brief,
          attachedDocs: factSheets,
          userPrompt: task.aiPrompt,
        });
        log(
          taskId,
          `Claude returned report=${result.report.length}ch summary=${
            result.summary.length
          }ch confidence=${result.confidenceScore ?? 'n/a'} ` +
            `tokens(in=${result.usage?.inputTokens ?? '?'}, out=${
              result.usage?.outputTokens ?? '?'
            }, cache_read=${result.usage?.cacheReadInputTokens ?? 0}, ` +
            `cache_write=${result.usage?.cacheCreationInputTokens ?? 0}) ` +
            `claude_duration=${result.durationMs}ms`
        );
        reportMarkdown = result.report;
        summary = result.summary;
        modelId = result.model;
        confidenceScore = result.confidenceScore ?? null;
        confidenceReason = result.confidenceReason ?? null;
      }

      const key = reportKey(taskId);
      await s3Service.putObjectText(key, reportMarkdown);
      log(taskId, `report written to s3://${key}`);

      // Auto-advance the Kanban column to IN_REVIEW when the report is ready
      // — but only from an in-flight state. Don't clobber a task a reviewer
      // has already moved to COMPLETE or reverted to TODO.
      const autoAdvance =
        task.status === 'IN_PROGRESS' || task.status === 'TODO';

      await prisma.task.update({
        where: { id: taskId },
        data: {
          aiStatus: 'SUCCEEDED' as TaskAiStatus,
          aiCompletedAt: new Date(),
          aiReportS3Key: key,
          aiReportSummary: summary.slice(0, 400),
          aiModel: modelId,
          aiConfidenceScore: confidenceScore,
          aiConfidenceReason: confidenceReason,
          ...(autoAdvance ? { status: 'IN_REVIEW' as const } : {}),
        },
      });
      log(
        taskId,
        `status → SUCCEEDED model=${modelId} ` +
          `kanban=${autoAdvance ? `${task.status}→IN_REVIEW` : task.status} ` +
          `total_wall=${Date.now() - wallStart}ms`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(taskId, `status → FAILED after ${Date.now() - wallStart}ms`, error);
      await prisma.task.update({
        where: { id: taskId },
        data: {
          aiStatus: 'FAILED' as TaskAiStatus,
          aiError: message.slice(0, 1000),
        },
      });
    }
  },

  async getReportMarkdown(taskId: string): Promise<string | null> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { aiReportS3Key: true },
    });
    if (!task?.aiReportS3Key) return null;
    try {
      return await s3Service.getObjectText(task.aiReportS3Key);
    } catch {
      return null;
    }
  },
};
