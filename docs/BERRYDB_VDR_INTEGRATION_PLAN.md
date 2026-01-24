# BerryDB Integration Plan for Virtual Data Room

## Executive Summary

This document outlines a comprehensive plan for integrating BerryDB (Berry AI) as the knowledge layer for DealDiligence.ai's Virtual Data Room (VDR). BerryDB is a knowledge system designed for AI agents that transforms unstructured documents into semantically rich, queryable knowledge graphs. By leveraging BerryDB's capabilities, we can provide M&A professionals with intelligent document search, automated clause extraction, risk identification, and relationship mapping across deal documents.

---

## Table of Contents

1. [Understanding BerryDB](#1-understanding-berrydb)
2. [M&A Due Diligence Pain Points](#2-ma-due-diligence-pain-points)
3. [How BerryDB Addresses These Pain Points](#3-how-berrydb-addresses-these-pain-points)
4. [Technical Architecture](#4-technical-architecture)
5. [Feature Implementation Roadmap](#5-feature-implementation-roadmap)
6. [Data Model Design](#6-data-model-design)
7. [API Integration Strategy](#7-api-integration-strategy)
8. [Security & Compliance Considerations](#8-security--compliance-considerations)
9. [Cost & Performance Optimization](#9-cost--performance-optimization)
10. [Risk Assessment & Mitigation](#10-risk-assessment--mitigation)

---

## 1. Understanding BerryDB

### 1.1 What is BerryDB?

BerryDB (Berry AI) is a **knowledge system for AI agents** that provides infrastructure for building and managing knowledge graphs across structured and unstructured data. Unlike traditional vector databases that only find similar items, BerryDB creates semantic layers that help AI understand:

- **How things relate** (entity relationships)
- **What things mean** (semantic understanding)
- **Why things matter** (contextual significance)

### 1.2 Core Capabilities

| Capability | Description | M&A Relevance |
|------------|-------------|---------------|
| **Knowledge Graphs** | Transforms documents into interconnected entity graphs | Map relationships between contracts, parties, obligations |
| **50+ Built-in AI Models** | NER, text classification, sentiment analysis, summarization | Auto-extract legal entities, clause types, risk indicators |
| **Unified Search** | SQL + Full-text + Annotation + Graph search in one system | Query across all document types with multiple search strategies |
| **Built-in Vector DB** | Semantic similarity search integrated with knowledge layer | Find similar clauses, related documents, comparable deals |
| **PDF Ingestion** | Native support for PDF processing | Handle scanned contracts, financial statements, legal documents |
| **Human-in-the-Loop** | Manual curation with lineage tracking | Legal review with audit trail |
| **LLM Agent Integration** | Chat interface over knowledge base | Natural language Q&A over deal room |

### 1.3 BerryDB Python SDK Overview

The SDK provides these primary modules:

```
BerryDB (Main Entry Point)
├── Database
│   ├── query() - Query documents with filters
│   ├── upsert() - Insert/update documents
│   ├── similarity_search() - Vector similarity search
│   ├── ingest_pdf() - Process PDF documents
│   ├── embed() - Generate embeddings
│   ├── ner() - Named Entity Recognition
│   ├── text_classification() - Classify text
│   ├── analyze_sentiment() - Sentiment analysis
│   └── chat() - LLM chat over database
│
├── AnnotationProject
│   ├── setup_label_config() - Configure annotation labels
│   ├── create_annotation() - Create annotations
│   └── create_prediction() - ML predictions
│
├── ModelConfig
│   ├── huggingface_builder() - HuggingFace models
│   ├── vertexai_builder() - Vertex AI models
│   └── berrydb_builder() - BerryDB native models
│
├── LLMAgent
│   ├── chat() - Conversational interface
│   └── save() / get() - Persist agents
│
└── Evaluator
    └── Run evaluations and compare model performance
```

### 1.4 Key Technical Features

1. **Multi-layer Annotations**: Add semantic layers as JSON on top of raw documents
2. **Image Similarity Search**: Hash-based fingerprinting for document comparison
3. **Horizontal Scaling**: Scale knowledge data and index nodes independently
4. **5x Faster Performance**: Claims faster reads/writes vs MongoDB/MySQL
5. **Multi-modal Support**: PDFs, images, audio, video, JSON

---

## 2. M&A Due Diligence Pain Points

### 2.1 Document Volume & Complexity

| Pain Point | Statistics | Impact |
|------------|-----------|--------|
| Document overload | 80%+ of enterprise data is unstructured | Weeks of manual review |
| Multi-format chaos | PDFs, emails, spreadsheets, scanned docs | Inconsistent extraction |
| Cross-document analysis | Information scattered across sources | Missed connections |
| Language barriers | Multi-jurisdictional deals | Translation delays |

### 2.2 Traditional Due Diligence Challenges

1. **Time Pressure**
   - Legal teams review hundreds of documents under intense deadlines
   - No room for oversight; fixed deadlines, high error risk
   - Due diligence is where M&A deals slow down

2. **Human Error Risk**
   - Manual review susceptible to fatigue-related mistakes
   - Critical clauses missed (e.g., change-of-control provisions)
   - Inconsistent analysis across reviewers

3. **Hidden Risks**
   - Undisclosed liabilities buried in contract footnotes
   - Non-standard provisions in vendor agreements
   - Material adverse change clauses with unusual triggers

4. **Resource Strain**
   - Valuable professionals doing repetitive document review
   - High cost of experienced M&A lawyers for basic tasks
   - Integration teams stretched during post-merger

### 2.3 Due Diligence Categories Requiring Document Analysis

| Category | Document Types | Key Extraction Needs |
|----------|---------------|---------------------|
| **Financial** | Income statements, balance sheets, audits, forecasts | Revenue figures, liabilities, cash flow metrics |
| **Legal** | Contracts, litigation records, IP filings | Obligations, termination clauses, dispute history |
| **Operational** | Org charts, supply chain docs, process manuals | Key personnel, supplier dependencies, capacity |
| **Tax** | Tax returns, IRS correspondence, transfer pricing | Tax positions, audit risks, deferred assets |
| **HR** | Employment contracts, benefit plans, complaints | Compensation obligations, retention risks, disputes |
| **Environmental** | Permits, audits, EPA notices | Compliance status, remediation costs, liabilities |
| **IP** | Patents, trademarks, licenses | Ownership, expiration dates, restrictions |
| **Customer** | Sales contracts, revenue data, churn reports | Concentration risk, renewal terms, MRR/ARR |

---

## 3. How BerryDB Addresses These Pain Points

### 3.1 Intelligent Document Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOCUMENT INGESTION                           │
├─────────────────────────────────────────────────────────────────┤
│  Upload (S3) → OCR → PDF Parsing → Text Extraction → Chunking  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BERRYDB ENRICHMENT                           │
├─────────────────────────────────────────────────────────────────┤
│  Named Entity Recognition (NER)                                 │
│    → Parties, Dates, Amounts, Jurisdictions, Products           │
│                                                                 │
│  Text Classification                                            │
│    → Document Type, Clause Type, Risk Level                     │
│                                                                 │
│  Relationship Extraction                                        │
│    → Party-to-Contract, Contract-to-Obligation, Clause Links    │
│                                                                 │
│  Embedding Generation                                           │
│    → Vector representations for similarity search               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE GRAPH                              │
├─────────────────────────────────────────────────────────────────┤
│  Entities: Companies, People, Contracts, Clauses, Dates, $$$    │
│  Relationships: signed_by, contains_clause, references, etc.    │
│  Annotations: risk_score, clause_type, compliance_status        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERFACES                              │
├─────────────────────────────────────────────────────────────────┤
│  Semantic Search: "Find all change-of-control clauses"          │
│  Q&A Chat: "What are the termination terms for Acme contract?"  │
│  Risk Dashboard: Auto-flagged issues by category                │
│  Relationship Graph: Visual entity connections                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Feature Mapping: Pain Points → BerryDB Solutions

| Pain Point | BerryDB Feature | Implementation |
|------------|-----------------|----------------|
| Can't find specific clauses | `similarity_search()` | Query for similar clause text |
| Unknown contract risks | `text_classification()` | Risk scoring model |
| Missing entities across docs | `ner()` | Extract parties, dates, amounts |
| No document relationships | Knowledge Graph | Entity linking and graph queries |
| Time-consuming review | `ingest_pdf()` + annotations | Automated extraction pipeline |
| Inconsistent analysis | Annotation standardization | Consistent labeling schema |
| Natural language queries | `LLMAgent.chat()` | "What contracts expire in Q1?" |
| Audit trail requirements | Lineage tracking | Who annotated what, when |

### 3.3 Specific M&A Use Cases

#### Use Case 1: Contract Clause Detection
```python
# Find all contracts missing a change-of-control clause
results = db.query(
    filter={
        "document_type": "contract",
        "annotations.change_of_control_clause": {"$exists": False}
    }
)
```

#### Use Case 2: Risk Identification
```python
# Classify document risk level
risk_assessment = db.text_classification(
    text=document_text,
    labels=["high_risk", "medium_risk", "low_risk"],
    model="legal-risk-classifier"
)
```

#### Use Case 3: Entity Extraction
```python
# Extract key entities from a contract
entities = db.ner(
    text=contract_text,
    entity_types=["PARTY", "DATE", "AMOUNT", "JURISDICTION", "PRODUCT"]
)
# Returns: {"PARTY": ["Acme Corp", "Beta Inc"], "AMOUNT": ["$5M"], ...}
```

#### Use Case 4: Semantic Search
```python
# Find contracts with similar indemnification language
similar_docs = db.similarity_search(
    query="unlimited indemnification for IP infringement claims",
    top_k=10,
    filter={"document_type": "contract"}
)
```

#### Use Case 5: Natural Language Q&A
```python
# Chat interface over deal room
agent = LLMAgent(database=db)
response = agent.chat(
    "Which supplier contracts have exclusivity provisions?"
)
```

---

## 4. Technical Architecture

### 4.1 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                              │
├─────────────────────────────────────────────────────────────────────┤
│  VDR UI │ Search Interface │ Chat Widget │ Risk Dashboard │ Graph   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                         │
├─────────────────────────────────────────────────────────────────────┤
│  API Gateway │ Auth (Auth0) │ RBAC │ Rate Limiting │ Audit Logs     │
├─────────────────────────────────────────────────────────────────────┤
│                      VDR Module (New)                                │
│  ┌───────────────┬────────────────┬─────────────────┐               │
│  │ Document      │ Search         │ Analysis        │               │
│  │ Service       │ Service        │ Service         │               │
│  │ (CRUD, S3)    │ (Query, RAG)   │ (NER, Risk)     │               │
│  └───────────────┴────────────────┴─────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
┌───────────────────┐ ┌───────────────┐ ┌───────────────────────┐
│   PostgreSQL      │ │   AWS S3      │ │   BerryDB (Hosted)    │
│   (Prisma ORM)    │ │   (Documents) │ │   (Knowledge Layer)   │
├───────────────────┤ ├───────────────┤ ├───────────────────────┤
│ - User/Project    │ │ - Raw files   │ │ - Knowledge graphs    │
│ - Permissions     │ │ - Versions    │ │ - Annotations         │
│ - Audit logs      │ │ - Previews    │ │ - Embeddings          │
│ - Metadata        │ │               │ │ - Search indexes      │
└───────────────────┘ └───────────────┘ └───────────────────────┘
```

### 4.2 BerryDB Integration Layer

Since BerryDB provides a Python SDK, we need a bridge for our Node.js backend:

**Option A: Python Microservice (Recommended)**
```
┌──────────────────────────────────────────────────────────────┐
│                    Node.js Backend                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           BerryDB Client Service (TypeScript)           │ │
│  │  - HTTP client to Python microservice                   │ │
│  │  - Request queuing and retry logic                      │ │
│  │  - Response caching                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │ HTTP/gRPC
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                 Python Microservice (FastAPI)                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              BerryDB SDK Wrapper                        │ │
│  │  - Database operations                                  │ │
│  │  - Document ingestion                                   │ │
│  │  - Search & query                                       │ │
│  │  - LLM Agent management                                 │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   BerryDB Cloud (Hosted)                      │
└──────────────────────────────────────────────────────────────┘
```

**Option B: BerryDB REST API (If Available)**
- Direct HTTP calls from Node.js
- No Python dependency
- Depends on BerryDB offering REST API (needs verification)

### 4.3 Document Processing Flow

```
1. UPLOAD
   User uploads document → S3 (raw storage) → PostgreSQL (metadata)

2. INGEST
   S3 event → Python service → BerryDB.ingest_pdf()

3. ENRICH
   BerryDB pipeline:
   ├── Text extraction
   ├── NER (entities)
   ├── Classification (doc type, risk)
   ├── Embedding generation
   └── Knowledge graph update

4. INDEX
   BerryDB indexes:
   ├── Full-text search index
   ├── Vector similarity index
   ├── Entity/relationship graph
   └── Annotation metadata

5. SYNC
   Python service → Node.js webhook → PostgreSQL (sync annotations)

6. QUERY
   User search → Node.js → Python service → BerryDB.query/search
```

---

## 5. Feature Implementation Roadmap

### Phase 2A: Foundation (Core VDR + Basic BerryDB)

| Feature | Description | BerryDB Methods |
|---------|-------------|-----------------|
| Document Upload | S3 storage with metadata | - |
| Basic Ingestion | PDF text extraction | `ingest_pdf()` |
| Full-Text Search | Keyword search across docs | `query()` |
| Document Metadata | Auto-extracted title, dates | `ner()` |
| Folder Structure | Standard DD categories | - |

**Deliverables:**
- Upload documents to S3 with PostgreSQL metadata
- Automatic PDF processing through BerryDB
- Basic search across document text
- Standard folder taxonomy (Financial, Legal, Operational, etc.)

### Phase 2B: Intelligent Extraction

| Feature | Description | BerryDB Methods |
|---------|-------------|-----------------|
| Entity Extraction | Parties, amounts, dates, jurisdictions | `ner()` |
| Document Classification | Auto-categorize by type | `text_classification()` |
| Clause Detection | Identify key legal clauses | `text_classification()` |
| Semantic Search | Find similar documents | `similarity_search()` |

**Deliverables:**
- Automatic entity tagging on all documents
- Document type classification (Contract, Financial Statement, etc.)
- Key clause extraction (Termination, Indemnification, COC, etc.)
- "Find Similar" functionality

### Phase 2C: Knowledge Graph & Relationships

| Feature | Description | BerryDB Methods |
|---------|-------------|-----------------|
| Entity Linking | Connect same entities across docs | Knowledge Graph |
| Relationship Mapping | Party-to-contract relationships | Graph queries |
| Document References | Cross-document citations | Annotation linking |
| Visual Graph | Interactive relationship explorer | Graph visualization |

**Deliverables:**
- Entity deduplication across deal room
- Visual graph of parties, contracts, obligations
- "Related Documents" suggestions
- Cross-reference discovery

### Phase 3: AI-Powered Intelligence

| Feature | Description | BerryDB Methods |
|---------|-------------|-----------------|
| Natural Language Q&A | Chat interface over deal room | `LLMAgent.chat()` |
| Risk Scoring | Automated risk assessment | `text_classification()` |
| Gap Analysis | Identify missing documents | Query + Analysis |
| Anomaly Detection | Flag unusual terms/amounts | Custom model |
| Summary Generation | Executive summaries | LLM integration |

**Deliverables:**
- Chat widget: "What are the key risks in this deal?"
- Risk dashboard with auto-flagged issues
- Missing document detection
- AI-generated deal summaries

---

## 6. Data Model Design

### 6.1 PostgreSQL Schema Extensions

```prisma
// prisma/schema.prisma additions for VDR

model Document {
  id              String   @id @default(uuid())
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id])

  // File storage
  s3Key           String   @unique
  fileName        String
  fileType        String   // pdf, docx, xlsx, etc.
  fileSize        Int
  mimeType        String

  // Folder/category
  folderId        String?
  folder          Folder?  @relation(fields: [folderId], references: [id])

  // BerryDB integration
  berryDbId       String?  @unique  // BerryDB document ID
  processingStatus String  @default("pending") // pending, processing, completed, failed

  // Extracted metadata (synced from BerryDB)
  title           String?
  documentType    String?  // contract, financial_statement, etc.
  extractedDate   DateTime?

  // Access control
  restrictedToRoles String[] @default([])

  // Audit
  uploadedById    String
  uploadedBy      ProjectMember @relation(fields: [uploadedById], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  entities        DocumentEntity[]
  annotations     DocumentAnnotation[]
  versions        DocumentVersion[]
}

model DocumentEntity {
  id          String   @id @default(uuid())
  documentId  String
  document    Document @relation(fields: [documentId], references: [id])

  entityType  String   // PARTY, DATE, AMOUNT, JURISDICTION, etc.
  entityValue String
  confidence  Float
  startOffset Int?
  endOffset   Int?

  // Link to master entity (for deduplication)
  masterEntityId String?
  masterEntity   MasterEntity? @relation(fields: [masterEntityId], references: [id])

  createdAt   DateTime @default(now())
}

model MasterEntity {
  id           String   @id @default(uuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id])

  entityType   String
  canonicalName String
  aliases      String[]

  // Extracted metadata
  metadata     Json?    // Additional structured data

  documents    DocumentEntity[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model DocumentAnnotation {
  id          String   @id @default(uuid())
  documentId  String
  document    Document @relation(fields: [documentId], references: [id])

  // Annotation type
  annotationType String  // clause_type, risk_level, sentiment, etc.
  annotationValue String
  confidence     Float?

  // Position in document (optional)
  pageNumber  Int?
  startOffset Int?
  endOffset   Int?

  // Human review
  isVerified  Boolean @default(false)
  verifiedById String?
  verifiedAt  DateTime?

  createdAt   DateTime @default(now())
}

model Folder {
  id          String   @id @default(uuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])

  name        String
  parentId    String?
  parent      Folder?  @relation("FolderHierarchy", fields: [parentId], references: [id])
  children    Folder[] @relation("FolderHierarchy")

  // Standard DD category
  categoryType String?  // financial, legal, operational, etc.

  // Access control
  restrictedToRoles String[] @default([])

  documents   Document[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model SearchQuery {
  id          String   @id @default(uuid())
  projectId   String
  userId      String

  queryText   String
  queryType   String   // full_text, semantic, entity, chat
  resultCount Int

  // Analytics
  createdAt   DateTime @default(now())
}
```

### 6.2 BerryDB Document Schema

```json
{
  "_id": "berrydb-doc-uuid",
  "external_id": "dealdiligence-doc-uuid",
  "project_id": "project-uuid",

  "content": {
    "raw_text": "Full document text...",
    "pages": [
      {"page_num": 1, "text": "Page 1 content..."},
      {"page_num": 2, "text": "Page 2 content..."}
    ]
  },

  "metadata": {
    "file_name": "Master_Services_Agreement.pdf",
    "file_type": "pdf",
    "upload_date": "2024-01-15T10:30:00Z",
    "folder_path": "/Legal/Contracts"
  },

  "annotations": {
    "document_type": {
      "value": "service_agreement",
      "confidence": 0.95,
      "model": "legal-doc-classifier-v2"
    },
    "risk_level": {
      "value": "medium",
      "confidence": 0.78,
      "factors": ["unlimited_liability", "short_termination_notice"]
    },
    "key_clauses": [
      {
        "type": "termination",
        "text": "Either party may terminate with 30 days notice...",
        "page": 8,
        "risk_flag": true
      },
      {
        "type": "indemnification",
        "text": "Service Provider shall indemnify and hold harmless...",
        "page": 12,
        "risk_flag": false
      }
    ]
  },

  "entities": {
    "parties": [
      {"name": "Acme Corporation", "role": "customer", "confidence": 0.98},
      {"name": "Beta Services LLC", "role": "provider", "confidence": 0.97}
    ],
    "dates": [
      {"type": "effective_date", "value": "2024-01-01", "confidence": 0.99},
      {"type": "expiration_date", "value": "2025-12-31", "confidence": 0.95}
    ],
    "amounts": [
      {"type": "contract_value", "value": 500000, "currency": "USD", "confidence": 0.92}
    ],
    "jurisdictions": [
      {"value": "Delaware", "confidence": 0.96}
    ]
  },

  "embeddings": {
    "document_vector": [0.123, -0.456, ...],  // 1536-dim
    "clause_vectors": {
      "termination": [0.789, -0.012, ...],
      "indemnification": [0.345, 0.678, ...]
    }
  },

  "relationships": [
    {
      "type": "references",
      "target_doc_id": "other-doc-uuid",
      "context": "As defined in the Master Agreement dated..."
    }
  ]
}
```

### 6.3 Standard Due Diligence Folder Taxonomy

```
📁 Deal Room
├── 📁 1. Financial
│   ├── 📁 1.1 Historical Financials
│   ├── 📁 1.2 Projections & Forecasts
│   ├── 📁 1.3 Audit Reports
│   ├── 📁 1.4 Tax Returns
│   └── 📁 1.5 Banking & Debt
│
├── 📁 2. Legal
│   ├── 📁 2.1 Corporate Documents
│   ├── 📁 2.2 Contracts (Material)
│   ├── 📁 2.3 Litigation
│   ├── 📁 2.4 Regulatory
│   └── 📁 2.5 Insurance
│
├── 📁 3. Operations
│   ├── 📁 3.1 Business Overview
│   ├── 📁 3.2 Supply Chain
│   ├── 📁 3.3 Technology
│   └── 📁 3.4 Facilities
│
├── 📁 4. Human Resources
│   ├── 📁 4.1 Org Structure
│   ├── 📁 4.2 Employment Agreements
│   ├── 📁 4.3 Benefits & Compensation
│   └── 📁 4.4 Labor Relations
│
├── 📁 5. Intellectual Property
│   ├── 📁 5.1 Patents
│   ├── 📁 5.2 Trademarks
│   ├── 📁 5.3 Copyrights
│   └── 📁 5.4 Trade Secrets
│
├── 📁 6. Customers & Sales
│   ├── 📁 6.1 Customer Contracts
│   ├── 📁 6.2 Revenue Analysis
│   └── 📁 6.3 Sales Pipeline
│
├── 📁 7. Environmental
│   ├── 📁 7.1 Permits
│   ├── 📁 7.2 Audits
│   └── 📁 7.3 Compliance
│
└── 📁 8. Other
    ├── 📁 8.1 Press & Media
    └── 📁 8.2 Miscellaneous
```

---

## 7. API Integration Strategy

### 7.1 Python Microservice Endpoints

```python
# berry_service/main.py (FastAPI)

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from berrydb import BerryDB

app = FastAPI(title="BerryDB Bridge Service")
berry = BerryDB(api_key=os.environ["BERRYDB_API_KEY"])

# ============================================
# Document Ingestion
# ============================================

class IngestRequest(BaseModel):
    document_id: str
    s3_url: str
    project_id: str
    metadata: dict

@app.post("/ingest")
async def ingest_document(req: IngestRequest, background_tasks: BackgroundTasks):
    """Ingest a document into BerryDB (async)"""
    background_tasks.add_task(process_document, req)
    return {"status": "processing", "document_id": req.document_id}

async def process_document(req: IngestRequest):
    db = berry.database(f"project_{req.project_id}")

    # 1. Ingest PDF
    result = db.ingest_pdf(
        url=req.s3_url,
        metadata={
            "external_id": req.document_id,
            **req.metadata
        }
    )

    # 2. Run NER
    entities = db.ner(
        text=result["text"],
        entity_types=["PARTY", "DATE", "AMOUNT", "JURISDICTION"]
    )

    # 3. Classify document
    doc_type = db.text_classification(
        text=result["text"][:5000],  # First 5k chars
        labels=["contract", "financial_statement", "legal_filing",
                "correspondence", "report", "other"]
    )

    # 4. Risk assessment
    risk = db.text_classification(
        text=result["text"][:10000],
        labels=["high_risk", "medium_risk", "low_risk"]
    )

    # 5. Update annotations
    db.upsert({
        "_id": result["_id"],
        "annotations": {
            "document_type": doc_type,
            "risk_level": risk,
            "entities": entities
        }
    })

    # 6. Webhook to Node.js
    await notify_completion(req.document_id, result)

# ============================================
# Search
# ============================================

class SearchRequest(BaseModel):
    project_id: str
    query: str
    search_type: str = "hybrid"  # full_text, semantic, hybrid
    filters: dict = {}
    limit: int = 20

@app.post("/search")
async def search_documents(req: SearchRequest):
    db = berry.database(f"project_{req.project_id}")

    if req.search_type == "semantic":
        results = db.similarity_search(
            query=req.query,
            top_k=req.limit,
            filter=req.filters
        )
    elif req.search_type == "full_text":
        results = db.query(
            query={"$text": {"$search": req.query}},
            filter=req.filters,
            limit=req.limit
        )
    else:  # hybrid
        semantic = db.similarity_search(query=req.query, top_k=req.limit * 2)
        full_text = db.query(query={"$text": {"$search": req.query}}, limit=req.limit * 2)
        results = merge_and_rerank(semantic, full_text, limit=req.limit)

    return {"results": results}

# ============================================
# Entity Search
# ============================================

@app.post("/entities/search")
async def search_entities(project_id: str, entity_type: str, query: str):
    db = berry.database(f"project_{project_id}")

    results = db.query(
        filter={
            f"entities.{entity_type}": {"$regex": query, "$options": "i"}
        }
    )

    return {"entities": results}

# ============================================
# Chat / Q&A
# ============================================

class ChatRequest(BaseModel):
    project_id: str
    message: str
    conversation_id: str = None

@app.post("/chat")
async def chat_with_documents(req: ChatRequest):
    db = berry.database(f"project_{req.project_id}")
    agent = db.llm_agent()

    response = agent.chat(
        message=req.message,
        conversation_id=req.conversation_id
    )

    return {
        "response": response["answer"],
        "sources": response["sources"],
        "conversation_id": response["conversation_id"]
    }

# ============================================
# Analysis
# ============================================

@app.post("/analyze/clauses")
async def extract_clauses(project_id: str, document_id: str):
    """Extract key legal clauses from a contract"""
    db = berry.database(f"project_{project_id}")
    doc = db.get_document_by_object_id(document_id)

    clause_types = [
        "termination", "indemnification", "limitation_of_liability",
        "change_of_control", "confidentiality", "non_compete",
        "intellectual_property", "warranty", "force_majeure"
    ]

    results = []
    for clause_type in clause_types:
        detection = db.text_classification(
            text=doc["content"],
            labels=[f"contains_{clause_type}", f"no_{clause_type}"]
        )

        if detection["label"] == f"contains_{clause_type}":
            # Extract the actual clause text
            clause_text = extract_clause_text(doc["content"], clause_type)
            results.append({
                "type": clause_type,
                "present": True,
                "confidence": detection["confidence"],
                "text": clause_text
            })

    return {"clauses": results}

@app.post("/analyze/risks")
async def analyze_risks(project_id: str, document_ids: list[str] = None):
    """Analyze risks across documents"""
    db = berry.database(f"project_{project_id}")

    query = {}
    if document_ids:
        query["_id"] = {"$in": document_ids}

    docs = db.query(filter=query)

    risks = []
    for doc in docs:
        if doc.get("annotations", {}).get("risk_level", {}).get("value") == "high_risk":
            risks.append({
                "document_id": doc["external_id"],
                "document_name": doc["metadata"]["file_name"],
                "risk_factors": doc["annotations"].get("risk_factors", []),
                "flagged_clauses": [
                    c for c in doc["annotations"].get("key_clauses", [])
                    if c.get("risk_flag")
                ]
            })

    return {"high_risk_documents": risks}
```

### 7.2 Node.js Client Service

```typescript
// backend/src/services/berrydb.service.ts

import axios, { AxiosInstance } from 'axios';

interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  score: number;
  highlights: string[];
}

interface ChatResponse {
  response: string;
  sources: Array<{ documentId: string; title: string; excerpt: string }>;
  conversationId: string;
}

interface RiskAnalysis {
  highRiskDocuments: Array<{
    documentId: string;
    documentName: string;
    riskFactors: string[];
    flaggedClauses: Array<{ type: string; text: string }>;
  }>;
}

export class BerryDBService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.BERRYDB_SERVICE_URL || 'http://localhost:8000',
      timeout: 30000,
    });
  }

  async ingestDocument(params: {
    documentId: string;
    s3Url: string;
    projectId: string;
    metadata: Record<string, unknown>;
  }): Promise<{ status: string }> {
    const response = await this.client.post('/ingest', {
      document_id: params.documentId,
      s3_url: params.s3Url,
      project_id: params.projectId,
      metadata: params.metadata,
    });
    return response.data;
  }

  async search(params: {
    projectId: string;
    query: string;
    searchType?: 'full_text' | 'semantic' | 'hybrid';
    filters?: Record<string, unknown>;
    limit?: number;
  }): Promise<{ results: SearchResult[] }> {
    const response = await this.client.post('/search', {
      project_id: params.projectId,
      query: params.query,
      search_type: params.searchType || 'hybrid',
      filters: params.filters || {},
      limit: params.limit || 20,
    });
    return response.data;
  }

  async chat(params: {
    projectId: string;
    message: string;
    conversationId?: string;
  }): Promise<ChatResponse> {
    const response = await this.client.post('/chat', {
      project_id: params.projectId,
      message: params.message,
      conversation_id: params.conversationId,
    });
    return response.data;
  }

  async extractClauses(
    projectId: string,
    documentId: string
  ): Promise<{ clauses: Array<{ type: string; present: boolean; confidence: number; text?: string }> }> {
    const response = await this.client.post('/analyze/clauses', null, {
      params: { project_id: projectId, document_id: documentId },
    });
    return response.data;
  }

  async analyzeRisks(
    projectId: string,
    documentIds?: string[]
  ): Promise<RiskAnalysis> {
    const response = await this.client.post('/analyze/risks', {
      project_id: projectId,
      document_ids: documentIds,
    });
    return response.data;
  }

  async searchEntities(
    projectId: string,
    entityType: string,
    query: string
  ): Promise<{ entities: Array<{ value: string; documentCount: number }> }> {
    const response = await this.client.post('/entities/search', null, {
      params: { project_id: projectId, entity_type: entityType, query },
    });
    return response.data;
  }
}

export const berryDBService = new BerryDBService();
```

### 7.3 VDR API Endpoints (Node.js)

```typescript
// backend/src/modules/vdr/vdr.routes.ts

import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requireProjectAccess, requireMinRole } from '../../middleware/permissions';
import * as controller from './vdr.controller';

const router = Router();

// Document CRUD
router.post(
  '/projects/:projectId/documents',
  requireAuth,
  requireProjectAccess,
  requireMinRole('MEMBER'),
  asyncHandler(controller.uploadDocument)
);

router.get(
  '/projects/:projectId/documents',
  requireAuth,
  requireProjectAccess,
  asyncHandler(controller.listDocuments)
);

router.get(
  '/projects/:projectId/documents/:documentId',
  requireAuth,
  requireProjectAccess,
  asyncHandler(controller.getDocument)
);

router.delete(
  '/projects/:projectId/documents/:documentId',
  requireAuth,
  requireProjectAccess,
  requireMinRole('ADMIN'),
  asyncHandler(controller.deleteDocument)
);

// Search
router.post(
  '/projects/:projectId/search',
  requireAuth,
  requireProjectAccess,
  asyncHandler(controller.searchDocuments)
);

router.post(
  '/projects/:projectId/search/entities',
  requireAuth,
  requireProjectAccess,
  asyncHandler(controller.searchEntities)
);

// Chat / Q&A
router.post(
  '/projects/:projectId/chat',
  requireAuth,
  requireProjectAccess,
  asyncHandler(controller.chatWithDocuments)
);

// Analysis
router.get(
  '/projects/:projectId/documents/:documentId/clauses',
  requireAuth,
  requireProjectAccess,
  asyncHandler(controller.getDocumentClauses)
);

router.get(
  '/projects/:projectId/risks',
  requireAuth,
  requireProjectAccess,
  asyncHandler(controller.getRiskAnalysis)
);

// Folders
router.get(
  '/projects/:projectId/folders',
  requireAuth,
  requireProjectAccess,
  asyncHandler(controller.listFolders)
);

router.post(
  '/projects/:projectId/folders',
  requireAuth,
  requireProjectAccess,
  requireMinRole('ADMIN'),
  asyncHandler(controller.createFolder)
);

export default router;
```

---

## 8. Security & Compliance Considerations

### 8.1 Data Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Encryption at Rest** | S3 server-side encryption (AES-256), BerryDB hosted encryption |
| **Encryption in Transit** | TLS 1.3 for all API calls |
| **Access Control** | RBAC with folder-level permissions |
| **Audit Logging** | All document access logged with user, timestamp, action |
| **Data Isolation** | Separate BerryDB database per project |
| **Secret Management** | Environment variables, AWS Secrets Manager |

### 8.2 Compliance Mapping

| Compliance | VDR Feature | BerryDB Consideration |
|------------|-------------|----------------------|
| **SOC 2 Type 2** | Audit logs, access controls | Verify BerryDB SOC 2 certification |
| **GDPR** | Data deletion, export | Ensure BerryDB supports data purge |
| **CCPA** | Privacy controls | User consent for AI processing |
| **SEC** | Financial data handling | Retention policies |

### 8.3 AI-Specific Compliance

1. **Transparency**: Clearly indicate AI-generated annotations
2. **Human Review**: All AI flags can be verified/corrected by users
3. **Explainability**: Show confidence scores and source text for extractions
4. **Bias Monitoring**: Track annotation accuracy across document types
5. **Data Minimization**: Only process text needed for requested features

### 8.4 Access Control Implementation

```typescript
// Folder-level access control
async function canAccessDocument(userId: string, documentId: string): Promise<boolean> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      folder: true,
      project: {
        include: {
          members: {
            where: { userId }
          }
        }
      }
    }
  });

  if (!document) return false;

  const member = document.project.members[0];
  if (!member) return false;

  // OWNER and ADMIN have full access
  if (['OWNER', 'ADMIN'].includes(member.role)) {
    return true;
  }

  // Check canAccessVDR permission
  if (!member.permissions?.canAccessVDR) {
    return false;
  }

  // Check folder restrictions
  const restrictedFolders = member.permissions?.restrictedFolders || [];
  if (restrictedFolders.length > 0 && document.folder) {
    return restrictedFolders.includes(document.folder.id);
  }

  return true;
}
```

---

## 9. Cost & Performance Optimization

### 9.1 BerryDB Cost Model (Estimated)

BerryDB is a hosted service priced on usage. Key cost drivers:

| Cost Factor | Optimization Strategy |
|-------------|----------------------|
| **Storage** | Compress documents before ingestion, archive old deals |
| **Processing** | Batch ingestion during off-peak hours |
| **Search Queries** | Cache frequent searches, implement query debouncing |
| **AI Models** | Use lightweight models for initial classification, expensive models only when needed |
| **LLM Chat** | Rate limit chat queries, cache common questions |

### 9.2 Performance Optimization

```typescript
// Caching strategy
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function searchWithCache(projectId: string, query: string): Promise<SearchResult[]> {
  const cacheKey = `search:${projectId}:${hashQuery(query)}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Execute search
  const results = await berryDBService.search({ projectId, query });

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(results));

  return results;
}
```

### 9.3 Batch Processing

```python
# Process documents in batches to reduce API calls
async def batch_ingest(documents: list[dict]):
    BATCH_SIZE = 10

    for i in range(0, len(documents), BATCH_SIZE):
        batch = documents[i:i + BATCH_SIZE]

        # Process batch concurrently
        await asyncio.gather(*[
            process_document(doc) for doc in batch
        ])

        # Rate limit between batches
        await asyncio.sleep(1)
```

---

## 10. Risk Assessment & Mitigation

### 10.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| BerryDB service outage | Medium | High | Implement fallback to basic S3/PostgreSQL search |
| Python microservice latency | Medium | Medium | Async processing, queue-based architecture |
| NER/classification accuracy | High | Medium | Human review workflow, confidence thresholds |
| Data sync issues | Medium | High | Idempotent sync, conflict resolution |
| Cost overruns | Medium | Medium | Usage monitoring, alerts, rate limiting |

### 10.2 Mitigation Strategies

**Fallback Search Mode**
```typescript
async function searchWithFallback(params: SearchParams): Promise<SearchResult[]> {
  try {
    return await berryDBService.search(params);
  } catch (error) {
    // Fallback to PostgreSQL full-text search
    logger.warn('BerryDB unavailable, using fallback search', { error });
    return await postgresFullTextSearch(params);
  }
}
```

**Confidence Thresholds**
```typescript
// Only show high-confidence extractions by default
const CONFIDENCE_THRESHOLDS = {
  document_type: 0.85,
  entity_extraction: 0.80,
  risk_level: 0.75,
  clause_detection: 0.70,
};

function filterByConfidence(annotations: Annotation[]): Annotation[] {
  return annotations.filter(a =>
    a.confidence >= CONFIDENCE_THRESHOLDS[a.type] || a.isVerified
  );
}
```

### 10.3 Vendor Lock-in Considerations

- **Data Export**: Ensure all raw documents remain in S3 (not just BerryDB)
- **Annotation Portability**: Sync key annotations back to PostgreSQL
- **API Abstraction**: Abstract BerryDB calls behind interface for potential swap
- **Fallback Path**: Maintain basic search capability without BerryDB

---

## Appendix A: BerryDB SDK Reference

### A.1 Key Methods Summary

| Method | Purpose | M&A Use Case |
|--------|---------|--------------|
| `BerryDB.connect()` | Initialize connection | Setup |
| `BerryDB.create_database()` | Create project database | New deal room |
| `Database.ingest_pdf()` | Process PDF document | Document upload |
| `Database.query()` | Filter-based search | Find documents by criteria |
| `Database.similarity_search()` | Semantic search | Find similar clauses |
| `Database.upsert()` | Update document | Add annotations |
| `Database.ner()` | Entity extraction | Extract parties, dates, amounts |
| `Database.text_classification()` | Classify text | Document type, risk level |
| `Database.embed()` | Generate embeddings | Custom similarity |
| `Database.chat()` | Q&A over database | Natural language queries |
| `LLMAgent.chat()` | Conversational AI | Deal room assistant |
| `Evaluator.run()` | Evaluate model | Measure accuracy |

### A.2 Supported File Types

- PDF (native support with `ingest_pdf()`)
- Images (PNG, JPG, etc.)
- Audio (transcription support)
- Video (frame extraction)
- JSON (native support)
- Text files

### A.3 Built-in AI Models

- Named Entity Recognition (NER)
- Text Classification
- Sentiment Analysis
- Object Recognition (images)
- Text Summarization
- 50+ semantic extraction models

---

## Appendix B: M&A Due Diligence Checklist

### B.1 Standard Categories

1. **Financial** - Statements, audits, projections, tax
2. **Legal** - Contracts, litigation, corporate docs
3. **Operational** - Business overview, supply chain, facilities
4. **HR** - Employment, benefits, labor relations
5. **IP** - Patents, trademarks, copyrights
6. **Customers** - Contracts, revenue, churn
7. **Environmental** - Permits, audits, compliance
8. **Tax** - Returns, audits, positions
9. **Insurance** - Policies, claims, coverage
10. **Regulatory** - Licenses, compliance, filings

### B.2 Key Contract Clauses to Extract

| Clause Type | Risk Indicator | Auto-Extract |
|-------------|----------------|--------------|
| Change of Control | Deal impact | Yes |
| Termination | Continuity risk | Yes |
| Indemnification | Liability exposure | Yes |
| Limitation of Liability | Risk cap | Yes |
| Non-Compete | Business restriction | Yes |
| Assignment | Transferability | Yes |
| Confidentiality | Data handling | Yes |
| IP Ownership | Asset clarity | Yes |
| Warranty | Obligation scope | Yes |
| Force Majeure | Performance excuse | Yes |

---

## Appendix C: Resources

### C.1 BerryDB Documentation
- Main site: [berrydb.io](https://berrydb.io/)
- Python SDK: [docs.berrydb.io/python-sdk/1.6.7/](https://docs.berrydb.io/python-sdk/1.6.7/)
- Contact: unblock@berrydb.io

### C.2 M&A Due Diligence References
- [Diligent M&A Checklist](https://www.diligent.com/resources/blog/mergers-acquisitions-due-diligence-checklist)
- [DealRoom AI Due Diligence](https://dealroom.net/blog/ai-due-diligence)
- [V7 Labs AI VDR Guide](https://www.v7labs.com/blog/ai-virtual-data-rooms)

### C.3 Related Technologies
- [LangChain RAG Tutorial](https://python.langchain.com/docs/tutorials/rag/)
- [Pinecone Vector DB](https://www.pinecone.io/learn/vector-database/)
- [Neo4j Knowledge Graphs](https://neo4j.com/blog/developer/knowledge-graph-extraction-challenges/)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-01-21 | Claude | Initial comprehensive plan |

---

*This document should be reviewed and updated as BerryDB releases new features and as the DealDiligence.ai platform evolves.*
