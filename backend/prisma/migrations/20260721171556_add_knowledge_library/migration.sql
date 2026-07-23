-- CreateEnum
CREATE TYPE "LibraryNodeType" AS ENUM ('CHECKLIST_ITEM', 'PROVISION', 'RISK', 'OBLIGATION', 'ENTITY', 'SOURCE');

-- CreateEnum
CREATE TYPE "CoverageStatus" AS ENUM ('OPEN', 'COVERED', 'FLAGGED', 'THIN', 'NA');

-- CreateEnum
CREATE TYPE "LibraryEdgeType" AS ENUM ('EVIDENCES', 'SOURCED_FROM', 'MENTIONS', 'PEER_OF', 'RELATES_TO');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "libraryManifest" JSONB;

-- CreateTable
CREATE TABLE "LibraryNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "LibraryNodeType" NOT NULL,
    "workstreamId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "s3Key" TEXT,
    "status" "CoverageStatus",
    "clauseType" TEXT,
    "riskLevel" TEXT,
    "confidence" INTEGER,
    "pageNumber" INTEGER,
    "sourceDocumentId" TEXT,
    "masterEntityId" TEXT,
    "clauseAnnotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryEdge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "edgeType" "LibraryEdgeType" NOT NULL,
    "evidenceDocIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryNode_projectId_idx" ON "LibraryNode"("projectId");

-- CreateIndex
CREATE INDEX "LibraryNode_projectId_type_idx" ON "LibraryNode"("projectId", "type");

-- CreateIndex
CREATE INDEX "LibraryNode_projectId_workstreamId_idx" ON "LibraryNode"("projectId", "workstreamId");

-- CreateIndex
CREATE INDEX "LibraryNode_projectId_itemId_idx" ON "LibraryNode"("projectId", "itemId");

-- CreateIndex
CREATE INDEX "LibraryNode_projectId_status_idx" ON "LibraryNode"("projectId", "status");

-- CreateIndex
CREATE INDEX "LibraryNode_sourceDocumentId_idx" ON "LibraryNode"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "LibraryNode_masterEntityId_idx" ON "LibraryNode"("masterEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryNode_projectId_slug_key" ON "LibraryNode"("projectId", "slug");

-- CreateIndex
CREATE INDEX "LibraryEdge_projectId_idx" ON "LibraryEdge"("projectId");

-- CreateIndex
CREATE INDEX "LibraryEdge_fromNodeId_idx" ON "LibraryEdge"("fromNodeId");

-- CreateIndex
CREATE INDEX "LibraryEdge_toNodeId_idx" ON "LibraryEdge"("toNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEdge_fromNodeId_toNodeId_edgeType_key" ON "LibraryEdge"("fromNodeId", "toNodeId", "edgeType");

-- AddForeignKey
ALTER TABLE "LibraryNode" ADD CONSTRAINT "LibraryNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEdge" ADD CONSTRAINT "LibraryEdge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEdge" ADD CONSTRAINT "LibraryEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "LibraryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEdge" ADD CONSTRAINT "LibraryEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "LibraryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

