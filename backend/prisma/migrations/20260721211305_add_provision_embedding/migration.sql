-- CreateTable
CREATE TABLE "ProvisionEmbedding" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisionEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProvisionEmbedding_nodeId_key" ON "ProvisionEmbedding"("nodeId");

-- CreateIndex
CREATE INDEX "ProvisionEmbedding_projectId_idx" ON "ProvisionEmbedding"("projectId");

-- AddForeignKey
ALTER TABLE "ProvisionEmbedding" ADD CONSTRAINT "ProvisionEmbedding_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LibraryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

