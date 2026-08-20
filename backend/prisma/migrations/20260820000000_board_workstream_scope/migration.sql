-- CreateTable
CREATE TABLE "KanbanBoardWorkstream" (
    "boardId" TEXT NOT NULL,
    "workstreamId" TEXT NOT NULL,

    CONSTRAINT "KanbanBoardWorkstream_pkey" PRIMARY KEY ("boardId","workstreamId")
);

-- CreateIndex
CREATE INDEX "KanbanBoardWorkstream_boardId_idx" ON "KanbanBoardWorkstream"("boardId");

-- AddForeignKey
ALTER TABLE "KanbanBoardWorkstream" ADD CONSTRAINT "KanbanBoardWorkstream_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

