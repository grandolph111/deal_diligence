-- CreateEnum
CREATE TYPE "ExtractionBatchStatus" AS ENUM ('SUBMITTED', 'ENDED', 'FAILED', 'CANCELED');

-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'BATCHED';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "extractionBatchId" TEXT;

-- CreateTable
CREATE TABLE "ExtractionBatch" (
    "id" TEXT NOT NULL,
    "status" "ExtractionBatchStatus" NOT NULL DEFAULT 'SUBMITTED',
    "documentCount" INTEGER NOT NULL,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "erroredCount" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ExtractionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtractionBatch_status_idx" ON "ExtractionBatch"("status");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_extractionBatchId_fkey" FOREIGN KEY ("extractionBatchId") REFERENCES "ExtractionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

