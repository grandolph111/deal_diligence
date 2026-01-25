# Project Plan

## Overview

Implementation plan for DealDiligence.ai's Virtual Data Room (VDR) and AI-Powered Search features. This plan covers Phase 2 (VDR with BerryDB integration) and Phase 3 (AI Intelligence layer) as defined in the PRD.

**Reference:** `PRD.md`

---

## Task List

```json
[
  {
    "category": "setup",
    "phase": "2A",
    "description": "Infrastructure setup for VDR",
    "steps": [
      "Create AWS S3 bucket with server-side encryption (AES-256)",
      "Configure S3 CORS policy for frontend uploads",
      "Set up S3 bucket lifecycle policies for cost optimization",
      "Add S3 environment variables to .env",
      "Create Python microservice project structure (FastAPI)",
      "Set up BerryDB account and obtain API key",
      "Configure BerryDB environment variables",
      "Set up Redis for caching (optional for MVP)",
      "Verify S3 upload/download works from backend"
    ],
    "passes": true
  },
  {
    "category": "database",
    "phase": "2A",
    "description": "Database schema for VDR",
    "steps": [
      "Add Document model to Prisma schema",
      "Add Folder model with self-referencing hierarchy",
      "Add TaskDocument junction table for task-document linking",
      "Add AuditLog model for comprehensive logging",
      "Run prisma migrate to create tables",
      "Seed default folder taxonomy for new projects",
      "Verify all relations work correctly"
    ],
    "passes": true
  },
  {
    "category": "backend",
    "phase": "2A",
    "description": "Folder management API",
    "steps": [
      "Create folders module (validators, service, controller, routes)",
      "Implement GET /projects/:projectId/folders - list folder tree",
      "Implement POST /projects/:projectId/folders - create folder",
      "Implement PATCH /projects/:projectId/folders/:id - rename folder",
      "Implement DELETE /projects/:projectId/folders/:id - delete empty folder",
      "Add folder access control middleware",
      "Auto-generate default taxonomy on project creation",
      "Write integration tests for folder endpoints"
    ],
    "passes": true
  },
  {
    "category": "backend",
    "phase": "2A",
    "description": "Document upload and storage API",
    "steps": [
      "Create documents module (validators, service, controller, routes)",
      "Implement S3 presigned URL generation for uploads",
      "Implement POST /projects/:projectId/documents - upload metadata",
      "Implement GET /projects/:projectId/documents - list documents",
      "Implement GET /projects/:projectId/documents/:id - get document details",
      "Implement GET /projects/:projectId/documents/:id/download - download file",
      "Implement DELETE /projects/:projectId/documents/:id - delete document",
      "Add document access control based on folder permissions",
      "Implement bulk upload support (multiple files)",
      "Add file type validation (PDF only for MVP)",
      "Add file size validation (100MB limit)",
      "Write integration tests for document endpoints"
    ],
    "passes": true
  },
  {
    "category": "backend",
    "phase": "2A",
    "description": "Audit logging service",
    "steps": [
      "Create audit.service.ts with logging methods",
      "Log document upload, download, view, delete actions",
      "Log folder create, rename, delete actions",
      "Log search queries with query text",
      "Capture IP address and user agent",
      "Add audit middleware for automatic logging",
      "Write tests for audit logging"
    ],
    "passes": true
  },
  {
    "category": "backend",
    "phase": "2A",
    "description": "Python microservice - BerryDB bridge",
    "steps": [
      "Set up FastAPI project with async support",
      "Install BerryDB Python SDK",
      "Implement POST /ingest - ingest PDF into BerryDB",
      "Implement POST /search - full-text search",
      "Add health check endpoint",
      "Configure CORS for Node.js backend",
      "Add error handling and logging",
      "Create Dockerfile for containerization",
      "Write tests for microservice endpoints"
    ],
    "passes": true
  },
  {
    "category": "backend",
    "phase": "2A",
    "description": "Document processing pipeline",
    "steps": [
      "Create document processing queue (or simple async)",
      "Trigger BerryDB ingestion after S3 upload",
      "Update document status: pending -> processing -> completed/failed",
      "Handle OCR for scanned PDFs via BerryDB",
      "Implement webhook callback from Python service",
      "Sync basic metadata back to PostgreSQL",
      "Add retry logic for failed ingestions",
      "Write tests for processing pipeline"
    ],
    "passes": true
  },
  {
    "category": "backend",
    "phase": "2A",
    "description": "Full-text search API",
    "steps": [
      "Implement POST /projects/:projectId/search endpoint",
      "Integrate with Python microservice for BerryDB search",
      "Add folder filter to search",
      "Add date range filter to search",
      "Return snippets with highlighted matches",
      "Handle restricted documents (show 'Request Access')",
      "Implement search result pagination",
      "Add fallback to PostgreSQL if BerryDB unavailable",
      "Write tests for search functionality"
    ],
    "passes": true
  },
  {
    "category": "backend",
    "phase": "2A",
    "description": "Document-task linking API",
    "steps": [
      "Add TaskDocument model if not exists",
      "Implement POST /tasks/:taskId/documents - link document to task",
      "Implement DELETE /tasks/:taskId/documents/:docId - unlink document",
      "Implement GET /tasks/:taskId/documents - list linked documents",
      "Update task response to include linked documents",
      "Write tests for document-task linking"
    ],
    "passes": true
  },
  {
    "category": "frontend",
    "phase": "2A",
    "description": "VDR navigation and layout",
    "steps": [
      "Add VDR tab to project navigation",
      "Create VDR page component with two-panel layout",
      "Create folder tree sidebar component",
      "Implement folder expand/collapse functionality",
      "Create document list/grid view component",
      "Add breadcrumb navigation",
      "Style VDR layout for responsive design"
    ],
    "passes": true
  },
  {
    "category": "frontend",
    "phase": "2A",
    "description": "Folder management UI",
    "steps": [
      "Create folder tree component with icons",
      "Implement folder selection state",
      "Add 'Create Folder' button and modal",
      "Add folder rename functionality (inline edit or modal)",
      "Add folder delete with confirmation",
      "Show folder document count",
      "Handle empty folder states"
    ],
    "passes": true
  },
  {
    "category": "frontend",
    "phase": "2A",
    "description": "Document upload UI",
    "steps": [
      "Create upload button component",
      "Implement drag-and-drop upload zone",
      "Add file picker for single/multiple files",
      "Show upload progress indicator per file",
      "Display upload success/error states",
      "Validate file type (PDF) before upload",
      "Validate file size before upload",
      "Refresh document list after upload"
    ],
    "passes": true
  },
  {
    "category": "frontend",
    "phase": "2A",
    "description": "Document list and grid view",
    "steps": [
      "Create document card component",
      "Show document name, type badge, upload date",
      "Show processing status indicator",
      "Implement list view toggle",
      "Implement grid view toggle",
      "Add document selection (for bulk actions)",
      "Show 'Request Access' for restricted documents",
      "Implement document context menu (download, delete)"
    ],
    "passes": true
  },
  {
    "category": "frontend",
    "phase": "2A",
    "description": "Document viewer",
    "steps": [
      "Create document viewer page/modal",
      "Integrate PDF.js for in-browser PDF rendering",
      "Implement page navigation controls",
      "Implement zoom controls",
      "Add in-document search",
      "Create document details sidebar (metadata panel)",
      "Implement download button",
      "Handle view-only mode (disable download)",
      "Add back/close navigation"
    ],
    "passes": true
  },
  {
    "category": "frontend",
    "phase": "2A",
    "description": "Search UI",
    "steps": [
      "Create search input in VDR header",
      "Create search results page/panel",
      "Display results with highlighted snippets",
      "Show document metadata in results",
      "Add folder filter dropdown",
      "Add date range filter",
      "Implement search pagination",
      "Handle empty search results state",
      "Show 'Request Access' for restricted results"
    ],
    "passes": true
  },
  {
    "category": "frontend",
    "phase": "2A",
    "description": "Document-task linking UI",
    "steps": [
      "Add 'Attach Document' button to task detail view",
      "Create document picker modal",
      "Show linked documents as chips on task card",
      "Implement click-to-view linked document",
      "Add unlink document action",
      "Update task detail sidebar with documents section"
    ],
    "passes": true
  },
  {
    "category": "testing",
    "phase": "2A",
    "description": "Phase 2A integration testing",
    "steps": [
      "Test single PDF upload end-to-end",
      "Test bulk PDF upload",
      "Test scanned PDF OCR extraction",
      "Test folder CRUD operations",
      "Test full-text search with filters",
      "Test document viewer rendering",
      "Test document download",
      "Test view-only folder restriction",
      "Test document-task linking",
      "Test folder access permissions",
      "Test audit log entries created"
    ],
    "passes": true
  },
  {
    "category": "database",
    "phase": "2B",
    "description": "Database schema for intelligent extraction",
    "steps": [
      "Add DocumentEntity model to Prisma schema",
      "Add MasterEntity model for entity deduplication",
      "Add DocumentAnnotation model for clauses/risk",
      "Run prisma migrate",
      "Create indexes for entity queries"
    ],
    "passes": true
  },
  {
    "category": "backend",
    "phase": "2B",
    "description": "Python microservice - NER and classification",
    "steps": [
      "Implement entity extraction via BerryDB NER",
      "Implement document classification via BerryDB",
      "Implement clause detection classification",
      "Implement risk level classification",
      "Add POST /analyze/entities endpoint",
      "Add POST /analyze/classify endpoint",
      "Add POST /analyze/clauses endpoint",
      "Update ingestion pipeline to run all extractors",
      "Write tests for extraction endpoints"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "2B",
    "description": "Entity extraction API",
    "steps": [
      "Implement GET /projects/:projectId/documents/:id/entities",
      "Sync extracted entities from BerryDB to PostgreSQL",
      "Store entity confidence scores",
      "Store entity text positions (start/end offset)",
      "Flag low-confidence entities (< 80%)",
      "Implement entity search endpoint",
      "Write tests for entity endpoints"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "2B",
    "description": "Document classification API",
    "steps": [
      "Auto-classify documents during ingestion",
      "Store document type in PostgreSQL",
      "Implement manual classification override",
      "Add document type filter to search",
      "Write tests for classification"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "2B",
    "description": "Clause detection API",
    "steps": [
      "Implement GET /projects/:projectId/documents/:id/clauses",
      "Extract clause text and page number",
      "Flag risk clauses (unlimited liability, etc.)",
      "Store clauses as DocumentAnnotation records",
      "Add clause type filter to search",
      "Write tests for clause detection"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "2B",
    "description": "Semantic search API",
    "steps": [
      "Implement similarity_search in Python microservice",
      "Add searchType parameter to search endpoint (hybrid/semantic/keyword)",
      "Implement POST /search/similar/:docId endpoint",
      "Merge and rerank hybrid search results",
      "Write tests for semantic search"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "2B",
    "description": "Entity display UI",
    "steps": [
      "Add entities panel to document viewer sidebar",
      "Display entities grouped by type",
      "Show entity confidence scores",
      "Add entity highlighting toggle in viewer",
      "Implement different colors per entity type",
      "Add entity legend to viewer toolbar",
      "Click entity to see details"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "2B",
    "description": "Document classification UI",
    "steps": [
      "Show document type badge on document cards",
      "Add document type filter to search",
      "Implement manual classification override dropdown",
      "Update document details panel with type"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "2B",
    "description": "Clause detection UI",
    "steps": [
      "Add clauses panel to document viewer sidebar",
      "Display detected clauses with type and page",
      "Show risk-flagged clauses with warning icon",
      "Click clause to navigate to page in viewer",
      "Add clause type filter to search"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "2B",
    "description": "Semantic search UI",
    "steps": [
      "Add search type toggle (keyword/semantic/hybrid)",
      "Add 'Find Similar' button on document cards",
      "Display similarity scores in results",
      "Add entity filter to search (party names)",
      "Add amount filter to search"
    ],
    "passes": false
  },
  {
    "category": "testing",
    "phase": "2B",
    "description": "Phase 2B integration testing",
    "steps": [
      "Test entity extraction on sample contracts",
      "Test document classification accuracy",
      "Test clause detection on contracts",
      "Test semantic search relevance",
      "Test 'Find Similar' functionality",
      "Test entity highlighting in viewer",
      "Test search filters (type, entity, clause)"
    ],
    "passes": false
  },
  {
    "category": "database",
    "phase": "2C",
    "description": "Database schema for knowledge graph",
    "steps": [
      "Add relationship fields to MasterEntity",
      "Add EntityRelationship model if needed",
      "Run prisma migrate",
      "Create indexes for graph queries"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "2C",
    "description": "Entity deduplication service",
    "steps": [
      "Implement entity matching algorithm (fuzzy match)",
      "Create MasterEntity records for canonical entities",
      "Link DocumentEntity to MasterEntity",
      "Store entity aliases",
      "Implement admin merge/split entity endpoint",
      "Write tests for deduplication"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "2C",
    "description": "Relationship mapping API",
    "steps": [
      "Extract relationships during document ingestion",
      "Store party-to-contract relationships",
      "Store contract-references relationships",
      "Implement GET /entities/:id/relationships endpoint",
      "Implement GET /entities/:id/documents endpoint",
      "Write tests for relationship API"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "2C",
    "description": "Related documents API",
    "steps": [
      "Implement GET /documents/:id/related endpoint",
      "Rank by shared entity count",
      "Include which entities are shared",
      "Write tests for related documents"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "2C",
    "description": "Entity management UI",
    "steps": [
      "Create entity list page",
      "Show entity with document count",
      "Implement entity detail view",
      "Show all documents mentioning entity",
      "Add admin merge entity functionality",
      "Add admin split entity functionality"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "2C",
    "description": "Visual graph explorer",
    "steps": [
      "Choose graph visualization library (D3, Cytoscape, etc.)",
      "Create graph explorer page",
      "Display entities as nodes",
      "Display relationships as edges",
      "Implement node click to show details",
      "Add zoom and pan controls",
      "Add entity type filter",
      "Implement export graph as image"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "2C",
    "description": "Related documents UI",
    "steps": [
      "Add 'Related Documents' panel to document viewer",
      "Show related docs ranked by relevance",
      "Display shared entities for each related doc",
      "Click to navigate to related document"
    ],
    "passes": false
  },
  {
    "category": "testing",
    "phase": "2C",
    "description": "Phase 2C integration testing",
    "steps": [
      "Test entity deduplication across documents",
      "Test relationship extraction",
      "Test graph visualization",
      "Test related documents suggestions",
      "Test entity merge/split functionality"
    ],
    "passes": false
  },
  {
    "category": "database",
    "phase": "3",
    "description": "Database schema for AI features",
    "steps": [
      "Add ChatConversation model",
      "Add ChatMessage model with citations",
      "Run prisma migrate",
      "Create indexes for chat queries"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "3",
    "description": "Python microservice - LLM chat",
    "steps": [
      "Implement BerryDB LLMAgent integration",
      "Add POST /chat endpoint",
      "Support multi-turn conversations",
      "Return citations with page numbers",
      "Filter context by user's accessible documents",
      "Handle conversation ID for context",
      "Write tests for chat endpoint"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "3",
    "description": "Chat API",
    "steps": [
      "Implement POST /projects/:projectId/chat - send message",
      "Implement GET /projects/:projectId/chat/conversations - list",
      "Implement GET /projects/:projectId/chat/conversations/:id - history",
      "Implement DELETE /projects/:projectId/chat/conversations/:id",
      "Store messages and citations in PostgreSQL",
      "Enforce folder access control in chat context",
      "Log chat queries to audit log",
      "Write tests for chat API"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "3",
    "description": "Risk dashboard API",
    "steps": [
      "Implement GET /projects/:projectId/risks endpoint",
      "Aggregate high-risk documents and clauses",
      "Calculate risk summary statistics",
      "Restrict to OWNER/ADMIN roles",
      "Write tests for risk dashboard"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "3",
    "description": "Human verification API",
    "steps": [
      "Implement POST /annotations/:id/verify endpoint",
      "Store verifiedBy, verifiedAt, verificationNote",
      "Implement POST /annotations/:id/reject endpoint",
      "Allow editing incorrect annotations",
      "Log verification actions to audit log",
      "Write tests for verification"
    ],
    "passes": false
  },
  {
    "category": "backend",
    "phase": "3",
    "description": "Gap analysis API",
    "steps": [
      "Define standard due diligence checklist",
      "Compare uploaded docs against checklist",
      "Implement GET /projects/:projectId/gaps endpoint",
      "Suggest missing document types",
      "Link to create task for missing docs",
      "Write tests for gap analysis"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "3",
    "description": "AI Assistant chat UI",
    "steps": [
      "Add AI Assistant tab to project navigation",
      "Create chat page layout",
      "Create message input component",
      "Create message history display",
      "Style user vs assistant messages",
      "Display citations as clickable links",
      "Click citation to open document at page",
      "Add 'New Conversation' button",
      "Show conversation list sidebar",
      "Implement conversation deletion"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "3",
    "description": "Risk dashboard UI",
    "steps": [
      "Create risk dashboard page (ADMIN/OWNER only)",
      "Display risk summary cards (high/medium/low counts)",
      "List high-risk documents with factors",
      "Show flagged clauses with excerpts",
      "Click to navigate to document/clause",
      "Add risk level filter",
      "Add document type filter"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "3",
    "description": "Human verification UI",
    "steps": [
      "Add 'Verify' and 'Incorrect' buttons to annotations",
      "Show verification status on annotations",
      "Display verifier name and timestamp",
      "Implement edit modal for incorrect annotations",
      "Filter annotations by verification status"
    ],
    "passes": false
  },
  {
    "category": "frontend",
    "phase": "3",
    "description": "Gap analysis UI",
    "steps": [
      "Create gap analysis section in VDR",
      "Display due diligence checklist",
      "Show completion status per category",
      "Highlight missing document types",
      "Add 'Create Request Task' button",
      "Link to relevant folder for uploads"
    ],
    "passes": false
  },
  {
    "category": "testing",
    "phase": "3",
    "description": "Phase 3 integration testing",
    "steps": [
      "Test chat with sample questions",
      "Verify chat respects folder permissions",
      "Verify citations are accurate",
      "Test risk dashboard data accuracy",
      "Test annotation verification workflow",
      "Test gap analysis against checklist"
    ],
    "passes": false
  },
  {
    "category": "security",
    "phase": "all",
    "description": "Security hardening",
    "steps": [
      "Implement rate limiting on all endpoints",
      "Add input validation for all user inputs",
      "Verify S3 bucket is not publicly accessible",
      "Verify document access control at API level",
      "Verify view-only mode enforced at API level",
      "Review and fix any SQL injection vectors",
      "Review and fix any XSS vectors",
      "Ensure audit logs cannot be tampered with",
      "Verify BerryDB API key is not exposed"
    ],
    "passes": false
  },
  {
    "category": "deployment",
    "phase": "all",
    "description": "Deployment and infrastructure",
    "steps": [
      "Create Docker Compose for local development",
      "Set up Python microservice in production",
      "Configure S3 bucket in production environment",
      "Set up Redis for caching (if using)",
      "Configure environment variables in production",
      "Set up monitoring and alerting",
      "Create deployment documentation"
    ],
    "passes": false
  },
  {
    "category": "documentation",
    "phase": "all",
    "description": "Documentation updates",
    "steps": [
      "Update CLAUDE.md with VDR module info",
      "Document VDR API endpoints in BACKEND.md",
      "Document Python microservice endpoints",
      "Create user guide for VDR features",
      "Create admin guide for risk dashboard",
      "Document BerryDB integration details"
    ],
    "passes": false
  }
]
```

---

## Phase Summary

| Phase | Category Count | Description |
|-------|---------------|-------------|
| **2A** | 17 tasks | Foundation VDR - upload, folders, search, viewer |
| **2B** | 9 tasks | Intelligent extraction - NER, classification, clauses |
| **2C** | 7 tasks | Knowledge graph - entity linking, relationships |
| **3** | 10 tasks | AI intelligence - chat, risk dashboard, verification |
| **All** | 3 tasks | Security, deployment, documentation |

---

## Critical Path

```
Infrastructure Setup (2A)
    └── Database Schema (2A)
          └── Python Microservice (2A)
                └── Document Upload API (2A)
                      └── Document Processing Pipeline (2A)
                            └── Full-Text Search API (2A)
                                  └── Frontend VDR (2A)
                                        └── Phase 2A Complete
                                              └── Phase 2B (Extraction)
                                                    └── Phase 2C (Graph)
                                                          └── Phase 3 (AI)
```

---

## Dependencies

| Task | Depends On |
|------|------------|
| Document Upload API | S3 Setup, Database Schema |
| Python Microservice | BerryDB Account |
| Full-Text Search | Python Microservice, Document Processing |
| Entity Extraction (2B) | Phase 2A Complete |
| Semantic Search (2B) | Entity Extraction |
| Knowledge Graph (2C) | Entity Extraction (2B) |
| Chat API (3) | Python Microservice, Phase 2B |
| Risk Dashboard (3) | Clause Detection (2B) |

---

## Open Questions Before Starting

1. [ ] BerryDB account created and API key obtained
2. [ ] BerryDB SOC 2 compliance verified
3. [ ] BerryDB pricing confirmed for expected volume
4. [ ] AWS S3 bucket provisioned
5. [ ] Python microservice hosting decision (same server, separate, containerized)
6. [ ] Redis caching decision (needed for MVP?)
