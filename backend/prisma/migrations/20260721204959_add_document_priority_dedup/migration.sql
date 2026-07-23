-- CreateEnum
CREATE TYPE "DocumentPriority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "ExtractionDepth" AS ENUM ('FULL', 'STUB');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "extractionDepth" "ExtractionDepth" NOT NULL DEFAULT 'FULL',
ADD COLUMN     "priority" "DocumentPriority" NOT NULL DEFAULT 'P2',
ADD COLUMN     "priorityReason" TEXT;

-- CreateIndex
CREATE INDEX "Document_processingStatus_priority_idx" ON "Document"("processingStatus", "priority");

-- CreateIndex
CREATE INDEX "Document_projectId_contentHash_idx" ON "Document"("projectId", "contentHash");

