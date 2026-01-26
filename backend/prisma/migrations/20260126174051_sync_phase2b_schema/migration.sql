-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "retryCount" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DocumentEntity" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT,
    "pageNumber" INTEGER,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "masterEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterEntity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityRelationship" (
    "id" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "documentId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAnnotation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "annotationType" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "clauseType" TEXT,
    "riskLevel" TEXT,
    "pageNumber" INTEGER,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "source" TEXT,
    "confidence" DOUBLE PRECISION DEFAULT 1.0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT,
    "isRejected" BOOLEAN NOT NULL DEFAULT false,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentEntity_documentId_idx" ON "DocumentEntity"("documentId");

-- CreateIndex
CREATE INDEX "DocumentEntity_documentId_entityType_idx" ON "DocumentEntity"("documentId", "entityType");

-- CreateIndex
CREATE INDEX "DocumentEntity_masterEntityId_idx" ON "DocumentEntity"("masterEntityId");

-- CreateIndex
CREATE INDEX "DocumentEntity_entityType_idx" ON "DocumentEntity"("entityType");

-- CreateIndex
CREATE INDEX "DocumentEntity_needsReview_idx" ON "DocumentEntity"("needsReview");

-- CreateIndex
CREATE INDEX "MasterEntity_projectId_idx" ON "MasterEntity"("projectId");

-- CreateIndex
CREATE INDEX "MasterEntity_projectId_entityType_idx" ON "MasterEntity"("projectId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "MasterEntity_projectId_entityType_canonicalName_key" ON "MasterEntity"("projectId", "entityType", "canonicalName");

-- CreateIndex
CREATE INDEX "EntityRelationship_sourceEntityId_idx" ON "EntityRelationship"("sourceEntityId");

-- CreateIndex
CREATE INDEX "EntityRelationship_targetEntityId_idx" ON "EntityRelationship"("targetEntityId");

-- CreateIndex
CREATE INDEX "EntityRelationship_relationshipType_idx" ON "EntityRelationship"("relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "EntityRelationship_sourceEntityId_targetEntityId_relationsh_key" ON "EntityRelationship"("sourceEntityId", "targetEntityId", "relationshipType");

-- CreateIndex
CREATE INDEX "DocumentAnnotation_documentId_idx" ON "DocumentAnnotation"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAnnotation_documentId_annotationType_idx" ON "DocumentAnnotation"("documentId", "annotationType");

-- CreateIndex
CREATE INDEX "DocumentAnnotation_annotationType_idx" ON "DocumentAnnotation"("annotationType");

-- CreateIndex
CREATE INDEX "DocumentAnnotation_clauseType_idx" ON "DocumentAnnotation"("clauseType");

-- CreateIndex
CREATE INDEX "DocumentAnnotation_riskLevel_idx" ON "DocumentAnnotation"("riskLevel");

-- CreateIndex
CREATE INDEX "DocumentAnnotation_isVerified_idx" ON "DocumentAnnotation"("isVerified");

-- CreateIndex
CREATE INDEX "DocumentAnnotation_isRejected_idx" ON "DocumentAnnotation"("isRejected");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- AddForeignKey
ALTER TABLE "DocumentEntity" ADD CONSTRAINT "DocumentEntity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEntity" ADD CONSTRAINT "DocumentEntity_masterEntityId_fkey" FOREIGN KEY ("masterEntityId") REFERENCES "MasterEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterEntity" ADD CONSTRAINT "MasterEntity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelationship" ADD CONSTRAINT "EntityRelationship_sourceEntityId_fkey" FOREIGN KEY ("sourceEntityId") REFERENCES "MasterEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelationship" ADD CONSTRAINT "EntityRelationship_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "MasterEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAnnotation" ADD CONSTRAINT "DocumentAnnotation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAnnotation" ADD CONSTRAINT "DocumentAnnotation_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAnnotation" ADD CONSTRAINT "DocumentAnnotation_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
