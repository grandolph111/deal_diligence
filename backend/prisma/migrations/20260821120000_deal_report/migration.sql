-- The deal report: findings filed under a risk category, each carrying both the
-- AI's draft and the reviewer's version.

-- Approval used to only move a task to COMPLETE. A client-facing report has to
-- be able to say who stands behind a finding, so record the approver.
ALTER TABLE "Task" ADD COLUMN "aiApprovedById" TEXT;
ALTER TABLE "Task" ADD COLUMN "aiApprovedAt" TIMESTAMP(3);

-- `Task.riskCategory` was a free-text label. The term now names the deal's
-- organizing axis, so the column holds one of the 26 slugs. Existing values were
-- arbitrary strings that mean nothing on the new axis — clear them rather than
-- let them masquerade as category ids.
UPDATE "Task" SET "riskCategory" = NULL WHERE "riskCategory" IS NOT NULL;

CREATE TYPE "ReportEntryStatus" AS ENUM ('AI_DRAFT', 'IN_REVIEW', 'VERIFIED');

CREATE TABLE "ReportEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "riskCategoryId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "aiDraft" TEXT NOT NULL,
    "humanText" TEXT,
    "nextSteps" TEXT,
    "supplementalRequest" TEXT,
    "severity" TEXT,
    "status" "ReportEntryStatus" NOT NULL DEFAULT 'AI_DRAFT',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportEntry_projectId_riskCategoryId_idx" ON "ReportEntry"("projectId", "riskCategoryId");
CREATE INDEX "ReportEntry_projectId_status_idx" ON "ReportEntry"("projectId", "status");
CREATE INDEX "ReportEntry_taskId_idx" ON "ReportEntry"("taskId");

ALTER TABLE "ReportEntry" ADD CONSTRAINT "ReportEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportEntry" ADD CONSTRAINT "ReportEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportEntry" ADD CONSTRAINT "ReportEntry_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
