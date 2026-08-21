-- A board belongs to one subject-matter expert. Nullable: the auto-generated
-- "All Documents" default board has no SME, and a board outlives the departure
-- of its SME (ON DELETE SET NULL) so its task history is never cascade-deleted.
ALTER TABLE "KanbanBoard" ADD COLUMN "smeUserId" TEXT;

-- CreateIndex
CREATE INDEX "KanbanBoard_smeUserId_idx" ON "KanbanBoard"("smeUserId");

-- AddForeignKey
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_smeUserId_fkey" FOREIGN KEY ("smeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
